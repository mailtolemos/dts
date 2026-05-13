// Cron: refresh AssetSnapshot for top assets + evaluate snapshot alerts.
// Triggered by GitHub Actions every 5 minutes.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAllPrices } from '@/lib/services/market';
import { getOhlc } from '@/lib/providers/coingecko';
import { computeIndicators } from '@/lib/analysis/indicators';
import { findLevels, classifyStructure } from '@/lib/analysis/levels';
import { evaluateSnapshotAlerts } from '@/lib/alerts/evaluator';
import { assertCronAuth } from '@/lib/cron';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TOP_SYMBOLS = ['BTC','ETH','SOL','XRP','BNB','ADA','AVAX','DOGE','LINK','SPX','NDX','XAU','VIX','EURUSD','DXY'];

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest)  { return run(req); }

async function run(req: NextRequest) {
  const auth = assertCronAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: auth.reason } }, { status: 401 });
  const t0 = Date.now();
  let count = 0;
  try {
    const ticks = await getAllPrices();
    for (const sym of TOP_SYMBOLS) {
      const tick = ticks.find((t) => t.symbol === sym);
      if (!tick) continue;
      const asset = await prisma.asset.findUnique({ where: { symbol: sym } });
      if (!asset) continue;
      const ohlc = await getOhlc(sym, 90).catch(() => []);
      const ind = computeIndicators(ohlc);
      const lv = findLevels(ohlc);
      const trend = (ind.sma50 != null && ind.sma200 != null)
        ? (tick.price > ind.sma50 && tick.price > ind.sma200 ? 'UP'
          : tick.price < ind.sma50 && tick.price < ind.sma200 ? 'DOWN' : 'SIDEWAYS')
        : 'SIDEWAYS';
      const change24h = ohlc.length >= 2 ? ((ohlc[ohlc.length-1]!.c - ohlc[ohlc.length-2]!.c) / ohlc[ohlc.length-2]!.c) * 100 : null;
      const prev = await prisma.assetSnapshot.findFirst({ where: { assetId: asset.id }, orderBy: { at: 'desc' } });
      await prisma.assetSnapshot.create({
        data: {
          assetId: asset.id, last: tick.price, change24h, rsi14: ind.rsi14,
          macd: ind.macd as never, atr14: ind.atr14, bb: ind.bb as never,
          sma50: ind.sma50, sma200: ind.sma200, ema20: ind.ema20,
          trend: trend as 'UP' | 'DOWN' | 'SIDEWAYS',
          levels: lv as never, features: { structure: classifyStructure(ohlc) } as never,
        },
      });
      await evaluateSnapshotAlerts({
        assetId: asset.id, trend, prevTrend: prev?.trend,
        atr: ind.atr14, prevAtr: prev?.atr14,
      }).catch((e) => logger.warn({ err: String(e), sym }, 'alert eval'));
      count++;
    }
    return NextResponse.json({ ok: true, count, durationMs: Date.now() - t0 });
  } catch (e) {
    logger.error({ err: String(e) }, 'cron/refresh failed');
    return NextResponse.json({ ok: false, error: { code: 'INTERNAL', message: String(e) } }, { status: 500 });
  }
}

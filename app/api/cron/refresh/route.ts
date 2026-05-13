// Cron: lightweight per-asset price snapshot for top assets + alert eval.
// Intentionally avoids OHLC/indicator computation here (those are heavier and
// rate-limited via CoinGecko) — the analyst route computes them on demand.
// Triggered by GitHub Actions every 5 minutes.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAllPrices } from '@/lib/services/market';
import { evaluateTickAlerts } from '@/lib/alerts/evaluator';
import { assertCronAuth } from '@/lib/cron';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TOP_SYMBOLS = ['BTC','ETH','SOL','XRP','BNB','ADA','LINK','SPX','NDX','XAU','EURUSD','DXY','VIX'];

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest)  { return run(req); }

async function run(req: NextRequest) {
  const auth = assertCronAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: auth.reason } }, { status: 401 });
  const t0 = Date.now();
  try {
    // One batched Pyth call for everything.
    const ticks = await getAllPrices();
    // One DB roundtrip for the assets we care about.
    const assets = await prisma.asset.findMany({ where: { symbol: { in: TOP_SYMBOLS } } });
    const byId: Array<{ id: string; symbol: string }> = assets.map((a) => ({ id: a.id, symbol: a.symbol }));

    const written: string[] = [];
    for (const a of byId) {
      const tick = ticks.find((t) => t.symbol === a.symbol);
      if (!tick) continue;
      await prisma.assetSnapshot.create({
        data: { assetId: a.id, last: tick.price, trend: 'SIDEWAYS' },
      });
      // Tick-driven alerts (PRICE_CROSS / PCT_MOVE).
      await evaluateTickAlerts(tick).catch((e) => logger.warn({ err: String(e), sym: a.symbol }, 'tick alerts'));
      written.push(a.symbol);
    }
    return NextResponse.json({ ok: true, written, durationMs: Date.now() - t0 });
  } catch (e) {
    logger.error({ err: String(e) }, 'cron/refresh failed');
    return NextResponse.json({ ok: false, error: { code: 'INTERNAL', message: String(e) } }, { status: 500 });
  }
}

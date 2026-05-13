// Background worker. Run as a separate process: `pnpm worker`.
//
// Loops:
//  - every 60s: refresh AssetSnapshot for top-N assets
//  - every 15m: run AI analyst for top-N assets (skip if inputs unchanged)
//  - every 5m:  fetch news, classify, persist, evaluate news alerts
//  - every 1m:  evaluate snapshot-based alerts

import { prisma } from '../lib/db';
import { getAllPrices, regenerateCard } from '../lib/services/market';
import { getOhlc } from '../lib/providers/coingecko';
import { getNews } from '../lib/providers/cryptopanic';
import { getAllMacro } from '../lib/providers/fred';
import { classifyNews } from '../lib/ai/news';
import { computeIndicators } from '../lib/analysis/indicators';
import { findLevels, classifyStructure } from '../lib/analysis/levels';
import { classifyRegime, riskScore } from '../lib/analysis/regime';
import { evaluateSnapshotAlerts, evaluateNewsAlerts } from '../lib/alerts/evaluator';
import { logger } from '../lib/logger';

const TOP_SYMBOLS = ['BTC','ETH','SOL','XRP','BNB','ADA','AVAX','DOGE','LINK','SPX','NDX','XAU','VIX','EURUSD','DXY'];

let running = true;
process.on('SIGINT', () => { logger.info('worker shutting down'); running = false; });
process.on('SIGTERM', () => { running = false; });

async function refreshSnapshots() {
  try {
    const ticks = await getAllPrices();
    for (const sym of TOP_SYMBOLS) {
      const tick = ticks.find((t) => t.symbol === sym);
      if (!tick) continue;
      const asset = await prisma.asset.findUnique({ where: { symbol: sym } });
      if (!asset) continue;

      const ohlc = await getOhlc(sym, 90).catch(() => []);
      const ind  = computeIndicators(ohlc);
      const lv   = findLevels(ohlc);
      const trend = (ind.sma50 != null && ind.sma200 != null)
        ? (tick.price > ind.sma50 && tick.price > ind.sma200 ? 'UP'
          : tick.price < ind.sma50 && tick.price < ind.sma200 ? 'DOWN' : 'SIDEWAYS')
        : 'SIDEWAYS';
      const change24h = ohlc.length >= 2 ? ((ohlc[ohlc.length-1]!.c - ohlc[ohlc.length-2]!.c) / ohlc[ohlc.length-2]!.c) * 100 : null;

      const prev = await prisma.assetSnapshot.findFirst({ where: { assetId: asset.id }, orderBy: { at: 'desc' } });

      await prisma.assetSnapshot.create({
        data: {
          assetId: asset.id,
          last: tick.price, change24h: change24h ?? null,
          rsi14: ind.rsi14 ?? null,
          macd: ind.macd as never, atr14: ind.atr14 ?? null, bb: ind.bb as never,
          sma50: ind.sma50 ?? null, sma200: ind.sma200 ?? null, ema20: ind.ema20 ?? null,
          trend: trend as 'UP' | 'DOWN' | 'SIDEWAYS',
          levels: lv as never,
          features: { structure: classifyStructure(ohlc) } as never,
        },
      });

      // Alert evaluation against the diff.
      await evaluateSnapshotAlerts({
        assetId: asset.id,
        trend, prevTrend: prev?.trend,
        atr: ind.atr14 ?? null, prevAtr: prev?.atr14 ?? null,
      }).catch((e) => logger.warn({ err: String(e) }, 'evaluateSnapshotAlerts failed'));
    }
    logger.info({ count: TOP_SYMBOLS.length }, 'snapshots refreshed');
  } catch (err) {
    logger.error({ err: String(err) }, 'refreshSnapshots failed');
  }
}

async function runAnalystCycle() {
  for (const sym of TOP_SYMBOLS) {
    try {
      const result = await regenerateCard(sym);
      logger.info({ sym, bias: (result as { bias?: string }).bias }, 'card regenerated');
    } catch (err) {
      logger.warn({ err: String(err), sym }, 'analyst cycle item failed');
    }
  }
}

async function newsCycle() {
  try {
    const items = await getNews();
    for (const it of items.slice(0, 20)) {
      const exists = await prisma.newsItem.findUnique({ where: { url: it.url } });
      if (exists) continue;
      const cls = await classifyNews(it.title);
      const created = await prisma.newsItem.create({
        data: {
          url: it.url, source: it.source, title: it.title,
          publishedAt: new Date(it.publishedAt),
          impact: cls.impact, factuality: cls.factuality, secondOrder: cls.secondOrder,
        },
      });
      // Link to assets.
      const symbols = new Set([...(it.currencies ?? []), ...cls.affected]);
      for (const s of symbols) {
        const a = await prisma.asset.findUnique({ where: { symbol: s } });
        if (!a) continue;
        await prisma.newsAssetLink.upsert({
          where: { newsItemId_assetId: { newsItemId: created.id, assetId: a.id } },
          create: { newsItemId: created.id, assetId: a.id, weight: 1 }, update: {},
        });
        if (cls.impact === 'MEDIUM' || cls.impact === 'HIGH') {
          await evaluateNewsAlerts({ assetId: a.id, impact: cls.impact, newsId: created.id })
            .catch((e) => logger.warn({ err: String(e) }, 'news alerts failed'));
        }
      }
    }
    logger.info('news cycle done');
  } catch (err) {
    logger.error({ err: String(err) }, 'newsCycle failed');
  }
}

async function regimeCycle() {
  try {
    const macro = await getAllMacro();
    const btc = await getOhlc('BTC', 2).catch(() => []);
    const btcCh = btc.length >= 2 ? ((btc[btc.length-1]!.c - btc[btc.length-2]!.c) / btc[btc.length-2]!.c) * 100 : 0;
    const inputs = { btcChange1d: btcCh, spxChange1d: 0, vix: macro.VIX, us10y: macro.US10Y, dxyChange1d: 0, highImpactNews: 0 };
    const regime = classifyRegime(inputs);
    const rs = riskScore(inputs);
    await prisma.marketSnapshot.create({
      data: { regime, riskScore: rs, vix: macro.VIX, dxy: macro.DXY, summary: `regime=${regime} risk=${rs.toFixed(2)}`, inputs: inputs as never },
    });
    logger.info({ regime, riskScore: rs }, 'regime snapshot written');
  } catch (err) {
    logger.error({ err: String(err) }, 'regimeCycle failed');
  }
}

function loop(name: string, ms: number, fn: () => Promise<void>) {
  (async function tick() {
    if (!running) return;
    const t0 = Date.now();
    try { await fn(); } catch (err) { logger.error({ err: String(err), name }, 'loop iteration failed'); }
    logger.info({ name, durationMs: Date.now() - t0 }, 'loop done');
    setTimeout(tick, ms);
  })();
}

logger.info('DTS worker starting');
loop('snapshots',      60_000,    refreshSnapshots);
loop('analyst',     15 * 60_000,  runAnalystCycle);
loop('news',         5 * 60_000,  newsCycle);
loop('regime',          60_000,   regimeCycle);

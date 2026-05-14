// Composition layer used by API routes and cron endpoints.
// Real data only — no mock fallbacks. Pages serve from cached snapshots
// (DB / ISR) for speed; the cron writes fresh data.
import { prisma } from '../db';
import { getLatest, type FeedLookup } from '../providers/pyth';
import { getOhlc } from '../providers/coingecko';
import { getAllMacro } from '../providers/fred';
import { getFearGreed } from '../providers/sentiment';
import { getNews } from '../providers/cryptopanic';
import { buildFeatures } from '../analysis/features';
import { computeIndicators } from '../analysis/indicators';
import { findLevels, classifyStructure } from '../analysis/levels';
import { classifyRegime, riskScore } from '../analysis/regime';
import { runAnalyst } from '../ai/analyst';
import { marketSummary } from '../ai/news';
import { cardBus, priceBus } from '../alerts/bus';
import type { PriceTick, Trend, Regime } from '../types';

/** Pull live prices for every asset in DB that has a PYTH feed. */
export async function getAllPrices(): Promise<PriceTick[]> {
  const assets = await prisma.asset.findMany({
    include: { feeds: { where: { provider: 'PYTH', active: true } } },
  });
  const feeds: FeedLookup[] = [];
  for (const a of assets) {
    const f = a.feeds[0];
    if (!f) continue;
    feeds.push({ feedId: f.providerId, symbol: a.symbol });
  }
  const ticks = await getLatest(feeds);
  for (const t of ticks) {
    priceBus.emit({ symbol: t.symbol, last: t.price, conf: t.conf, at: new Date(t.publishTime * 1000).toISOString() });
  }
  return ticks;
}

export interface AssetBundle {
  asset: { symbol: string; name: string; assetClass: string };
  price: { last: number; conf: number; updatedAt: string; stale: boolean; source: string } | null;
  ohlc: Array<{ t: number; o: number; h: number; l: number; c: number; v?: number }>;
  indicators: ReturnType<typeof computeIndicators>;
  levels: { support: number[]; resistance: number[] };
  trend: Trend;
  structure: ReturnType<typeof classifyStructure>;
  news: Array<{ id: string; title: string; url: string; source: string; publishedAt: string; impact?: string }>;
  card: null | { bias: string; horizon: string; confidence: string; reasoning: string;
                 keyLevels: unknown; riskNotes: string; whatChangesView: string;
                 sourcesUsed: string[]; at: string };
}

export async function getAssetBundle(symbol: string): Promise<AssetBundle | null> {
  const asset = await prisma.asset.findUnique({
    where: { symbol },
    include: { feeds: { where: { provider: 'PYTH', active: true } } },
  });
  if (!asset) return null;

  const pythFeed = asset.feeds[0];
  const ticks = pythFeed
    ? await getLatest([{ feedId: pythFeed.providerId, symbol }])
    : [];
  const tick = ticks[0] ?? null;

  // OHLC only available for symbols mapped in CoinGecko (currently crypto).
  const ohlc = await getOhlc(symbol, 180);
  const ind = computeIndicators(ohlc);
  const lv = findLevels(ohlc);
  const structure = classifyStructure(ohlc);
  const trend: Trend = (tick && ind.sma50 != null && ind.sma200 != null)
    ? (tick.price > ind.sma50 && tick.price > ind.sma200 ? 'UP'
      : tick.price < ind.sma50 && tick.price < ind.sma200 ? 'DOWN' : 'SIDEWAYS')
    : 'SIDEWAYS';

  const cardRow = await prisma.aiAnalysis.findFirst({
    where: { assetId: asset.id }, orderBy: { at: 'desc' },
  });

  // News with this asset symbol mentioned.
  const allNews = await getNews(asset.assetClass === 'CRYPTO' ? { currency: symbol } : {});
  const news = allNews
    .filter((n) => !n.currencies || n.currencies.length === 0 || n.currencies.includes(symbol))
    .slice(0, 8)
    .map((n) => ({ id: n.id, title: n.title, url: n.url, source: n.source, publishedAt: n.publishedAt }));

  return {
    asset: { symbol: asset.symbol, name: asset.name, assetClass: asset.assetClass },
    price: tick ? {
      last: tick.price, conf: tick.conf, source: tick.source, stale: tick.stale,
      updatedAt: new Date(tick.publishTime * 1000).toISOString(),
    } : null,
    ohlc,
    indicators: ind,
    levels: lv,
    trend,
    structure,
    news,
    card: cardRow ? {
      bias: cardRow.bias, horizon: cardRow.horizon, confidence: cardRow.confidence,
      reasoning: cardRow.reasoning, keyLevels: cardRow.keyLevels,
      riskNotes: cardRow.riskNotes, whatChangesView: cardRow.whatChangesView,
      sourcesUsed: cardRow.sourcesUsed as string[], at: cardRow.at.toISOString(),
    } : null,
  };
}

export async function regenerateCard(symbol: string): Promise<unknown> {
  const asset = await prisma.asset.findUnique({
    where: { symbol },
    include: { feeds: { where: { provider: 'PYTH', active: true } } },
  });
  if (!asset) throw new Error('ASSET_NOT_FOUND');
  const pythFeed = asset.feeds[0];
  if (!pythFeed) throw new Error('NO_FEED');

  const ticks = await getLatest([{ feedId: pythFeed.providerId, symbol }]);
  const tick = ticks[0];
  if (!tick) throw new Error('NO_PRICE');

  const ohlc = await getOhlc(symbol, 180);
  const macroRaw = await getAllMacro();

  const regimeInputs = {
    spxChange1d: null,
    btcChange1d: pctChange(ohlc, 1),
    vix: macroRaw.VIX, us10y: macroRaw.US10Y,
    highImpactNews: 0,
  };
  const regime: Regime = classifyRegime(regimeInputs);
  const rs = riskScore(regimeInputs);

  const features = buildFeatures({
    asset: { symbol: asset.symbol, name: asset.name, class: asset.assetClass },
    tick, candles: ohlc,
    macro: { dxy: macroRaw.DXY, us10y: macroRaw.US10Y, vix: macroRaw.VIX },
    regime: { global: regime, riskScore: rs },
    news: (await getNews(asset.assetClass === 'CRYPTO' ? { currency: symbol } : {}))
      .slice(0, 5)
      .map((n) => ({ title: n.title, impact: 'LOW', factuality: 'REPORTED', publishedAt: n.publishedAt })),
  });

  const { card, inputsHash, model } = await runAnalyst(features);

  const saved = await prisma.aiAnalysis.create({
    data: {
      assetId: asset.id,
      bias: card.bias, horizon: card.horizon, confidence: card.confidence,
      reasoning: card.reasoning, keyLevels: card.keyLevels as never,
      riskNotes: card.riskNotes, whatChangesView: card.whatChangesView,
      sourcesUsed: card.sourcesUsed as never,
      model, inputsHash,
    },
  });

  cardBus.emit({ symbol, card: { ...card, at: saved.at.toISOString() }, at: saved.at.toISOString() });
  return { ...card, at: saved.at.toISOString() };
}

function pctChange(c: Array<{ c: number }>, lb: number): number | null {
  if (c.length <= lb) return null;
  const a = c[c.length - 1 - lb]!.c;
  const b = c[c.length - 1]!.c;
  return ((b - a) / a) * 100;
}

interface MoverRow { symbol: string; name: string; last: number; change24h: number }

/**
 * Dashboard data — derived from DB snapshots written by the cron, so the
 * page render is a fast pure-DB query. Falls back to live Pyth if the DB
 * is empty.
 */
export async function getDashboard() {
  // Latest snapshot per asset.
  const assets = await prisma.asset.findMany({
    include: {
      snapshots: { orderBy: { at: 'desc' }, take: 1 },
      feeds: { where: { provider: 'PYTH', active: true } },
    },
  });

  // If we have live Pyth feeds, refresh prices for assets that have a feed.
  const feedLookups: FeedLookup[] = [];
  for (const a of assets) {
    const f = a.feeds[0];
    if (f) feedLookups.push({ feedId: f.providerId, symbol: a.symbol });
  }
  const liveTicks = await getLatest(feedLookups);
  const liveBy = new Map(liveTicks.map((t) => [t.symbol, t]));

  const rows: Array<{ symbol: string; name: string; assetClass: string; last: number; change24h: number }> = [];
  for (const a of assets) {
    const snap = a.snapshots[0];
    const live = liveBy.get(a.symbol);
    const last = live?.price ?? snap?.last ?? null;
    if (last == null) continue;
    rows.push({
      symbol: a.symbol, name: a.name, assetClass: a.assetClass,
      last,
      change24h: snap?.change24h ?? 0,
    });
  }

  const byClass = (cls: string): MoverRow[] => rows
    .filter((r) => r.assetClass === cls)
    .map((r) => ({ symbol: r.symbol, name: r.name, last: r.last, change24h: r.change24h }))
    .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));

  // Most recent global market snapshot drives regime + summary.
  const latestRegime = await prisma.marketSnapshot.findFirst({ orderBy: { at: 'desc' } });
  const macro = await getAllMacro();
  const fg = await getFearGreed();

  let summary = latestRegime?.summary ?? '';
  if (!summary) {
    const news = await getNews();
    summary = await marketSummary({
      regime: latestRegime?.regime ?? 'CHOPPY',
      riskScore: latestRegime?.riskScore ?? 0,
      topMovers: byClass('CRYPTO').slice(0, 5).map((m) => ({ symbol: m.symbol, change24h: m.change24h })),
      topNews: news.slice(0, 5).map((n) => n.title),
      macro: { dxy: macro.DXY, us10y: macro.US10Y, vix: macro.VIX },
    });
  }

  return {
    at: new Date().toISOString(),
    regime: latestRegime?.regime ?? 'CHOPPY',
    riskScore: latestRegime?.riskScore ?? 0,
    summary,
    classes: {
      crypto:    { topMovers: byClass('CRYPTO').slice(0, 5),    aggChange24h: avg(byClass('CRYPTO').map((m) => m.change24h)) },
      equityIdx: { topMovers: byClass('INDEX').slice(0, 5),     aggChange24h: avg(byClass('INDEX').map((m) => m.change24h)) },
      commodity: { topMovers: byClass('COMMODITY').slice(0, 5), aggChange24h: avg(byClass('COMMODITY').map((m) => m.change24h)) },
      fx:        { topMovers: byClass('FX').slice(0, 5),         aggChange24h: avg(byClass('FX').map((m) => m.change24h)) },
    },
    vol: { vix: macro.VIX, dxy: macro.DXY },
    sentiment: fg,
  };
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

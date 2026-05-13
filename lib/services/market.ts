// Composition layer used by API routes and worker.
import { prisma } from '../db';
import { getLatest, type FeedLookup } from '../providers/pyth';
import { mockTick } from '../providers/mock';
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
import { UNIVERSE, findUniverse } from '../universe';
import { cardBus, priceBus } from '../alerts/bus';
import type { PriceTick, Trend, Regime } from '../types';

/** Build a fake feedId for assets we know via Pyth symbol but haven't resolved hex id yet. */
function feedIdFor(symbol: string): string {
  return `mock-${symbol.toLowerCase()}`;
}

/** Pull live prices for every asset in the DB (or universe if DB empty). */
export async function getAllPrices(): Promise<PriceTick[]> {
  const assets = await prisma.asset.findMany({ include: { feeds: true } });
  const list = assets.length ? assets : UNIVERSE.map((u) => ({ symbol: u.symbol, name: u.name, assetClass: u.assetClass, feeds: [] }));

  const feeds: FeedLookup[] = [];
  for (const a of list) {
    const pyth = (a as { feeds?: Array<{ provider: string; providerId: string }> }).feeds?.find((f) => f.provider === 'PYTH');
    if (pyth) feeds.push({ feedId: pyth.providerId, symbol: a.symbol });
  }

  const pythTicks = await getLatest(feeds);
  const got = new Map(pythTicks.map((t) => [t.symbol, t]));

  // Fill missing with mocks so the UI is never empty.
  const out: PriceTick[] = list.map((a) => got.get(a.symbol) ?? mockTick(a.symbol, feedIdFor(a.symbol)));
  // Emit to SSE bus so anyone listening can rebroadcast.
  for (const t of out) priceBus.emit({ symbol: t.symbol, last: t.price, conf: t.conf, at: new Date(t.publishTime * 1000).toISOString() });
  return out;
}

export interface AssetBundle {
  asset: { symbol: string; name: string; assetClass: string };
  price: { last: number; conf: number; updatedAt: string; stale: boolean; source: string };
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
  const universe = findUniverse(symbol);
  if (!universe) return null;

  // Load or stub the DB row.
  const dbAsset = await prisma.asset.findUnique({ where: { symbol } }).catch(() => null);
  const ticks = await getAllPrices();
  const tick = ticks.find((t) => t.symbol === symbol) ?? mockTick(symbol, feedIdFor(symbol));

  const ohlc = await getOhlc(symbol, 180);
  const ind  = computeIndicators(ohlc);
  const lv   = findLevels(ohlc);
  const structure = classifyStructure(ohlc);
  const trend: Trend = (ind.sma50 != null && ind.sma200 != null)
    ? (tick.price > ind.sma50 && tick.price > ind.sma200 ? 'UP'
      : tick.price < ind.sma50 && tick.price < ind.sma200 ? 'DOWN' : 'SIDEWAYS')
    : 'SIDEWAYS';

  // Latest card if any.
  let cardRow = null;
  if (dbAsset) {
    cardRow = await prisma.aiAnalysis.findFirst({
      where: { assetId: dbAsset.id }, orderBy: { at: 'desc' },
    });
  }

  // News for this asset.
  const allNews = await getNews(universe.assetClass === 'CRYPTO' ? { currency: symbol } : {});
  const news = allNews
    .filter((n) => !n.currencies || n.currencies.length === 0 || n.currencies.includes(symbol))
    .slice(0, 8)
    .map((n) => ({ id: n.id, title: n.title, url: n.url, source: n.source, publishedAt: n.publishedAt }));

  return {
    asset: { symbol: universe.symbol, name: universe.name, assetClass: universe.assetClass },
    price: {
      last: tick.price, conf: tick.conf, source: tick.source, stale: tick.stale,
      updatedAt: new Date(tick.publishTime * 1000).toISOString(),
    },
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
  const universe = findUniverse(symbol);
  if (!universe) throw new Error('ASSET_NOT_FOUND');

  const dbAsset = await prisma.asset.upsert({
    where: { symbol },
    create: { symbol, name: universe.name, assetClass: universe.assetClass },
    update: {},
  });

  const ticks = await getAllPrices();
  const tick = ticks.find((t) => t.symbol === symbol) ?? mockTick(symbol, feedIdFor(symbol));
  const ohlc = await getOhlc(symbol, 180);
  const macroRaw = await getAllMacro();
  const fg = await getFearGreed();

  const regimeInputs = {
    spxChange1d: pctChange(await getOhlc('BTC', 30).catch(() => ohlc), 1), // proxy
    btcChange1d: pctChange(ohlc, 1),
    vix: macroRaw.VIX, us10y: macroRaw.US10Y,
    highImpactNews: 0,
  };
  const regime: Regime = classifyRegime(regimeInputs);
  const rs = riskScore(regimeInputs);

  const features = buildFeatures({
    asset: { symbol: universe.symbol, name: universe.name, class: universe.assetClass },
    tick, candles: ohlc,
    macro: { dxy: macroRaw.DXY, us10y: macroRaw.US10Y, vix: macroRaw.VIX },
    regime: { global: regime, riskScore: rs },
    news: (await getNews(universe.assetClass === 'CRYPTO' ? { currency: symbol } : {}))
      .slice(0, 5)
      .map((n) => ({ title: n.title, impact: 'LOW', factuality: 'REPORTED', publishedAt: n.publishedAt })),
  });

  const { card, inputsHash, model } = await runAnalyst(features);

  const saved = await prisma.aiAnalysis.create({
    data: {
      assetId: dbAsset.id,
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

export async function getDashboard() {
  const ticks = await getAllPrices();
  // Build per-asset 24h change from OHLC for the universe (cached aggressively in coingecko).
  const changes = new Map<string, number>();
  await Promise.all(UNIVERSE.slice(0, 30).map(async (u) => {
    try {
      const o = await getOhlc(u.symbol, 2);
      if (o.length >= 2) {
        const ch = ((o[o.length - 1]!.c - o[o.length - 2]!.c) / o[o.length - 2]!.c) * 100;
        changes.set(u.symbol, ch);
      }
    } catch {/* ignore */}
  }));

  const byClass = (cls: string) => UNIVERSE
    .filter((u) => u.assetClass === cls)
    .map((u) => {
      const t = ticks.find((x) => x.symbol === u.symbol);
      return { symbol: u.symbol, name: u.name, last: t?.price ?? 0, change24h: changes.get(u.symbol) ?? 0 };
    })
    .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));

  const macro = await getAllMacro();
  const news  = await getNews();

  const btcOhlc = await getOhlc('BTC', 2).catch(() => []);
  const btcCh   = btcOhlc.length >= 2 ? ((btcOhlc[btcOhlc.length-1]!.c - btcOhlc[btcOhlc.length-2]!.c) / btcOhlc[btcOhlc.length-2]!.c) * 100 : 0;
  const spxCh   = changes.get('SPX') ?? 0;

  const regimeInputs = {
    spxChange1d: spxCh, btcChange1d: btcCh,
    vix: macro.VIX, us10y: macro.US10Y, dxyChange1d: 0, highImpactNews: 0,
  };
  const regime = classifyRegime(regimeInputs);
  const rs     = riskScore(regimeInputs);
  const fg     = await getFearGreed();

  const summary = await marketSummary({
    regime, riskScore: rs,
    topMovers: byClass('CRYPTO').slice(0, 5).map((m) => ({ symbol: m.symbol, change24h: m.change24h })),
    topNews: news.slice(0, 5).map((n) => n.title),
    macro: { dxy: macro.DXY, us10y: macro.US10Y, vix: macro.VIX },
  });

  return {
    at: new Date().toISOString(),
    regime, riskScore: rs, summary,
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

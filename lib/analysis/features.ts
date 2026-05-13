import type { Candle, PriceTick, Trend } from '../types';
import { computeIndicators, sma, bollinger, type IndicatorSnapshot } from './indicators';
import { findLevels, classifyStructure } from './levels';

export interface FeatureBag {
  asset:   { symbol: string; class: string; name: string };
  price:   { last: number; conf: number; stale: boolean; updatedAt: string };
  change:  { h1?: number; h24?: number; d7?: number; d30?: number };
  trend:   { direction: Trend; structure: ReturnType<typeof classifyStructure>;
             sma50: number | null; sma200: number | null; ema20: number | null };
  momentum:{ rsi14: number | null; macd: IndicatorSnapshot['macd'] };
  volatility: { atr14: number | null; atrPct: number | null;
                bbWidth: number | null; regime: 'EXPANDING' | 'COMPRESSING' | 'NEUTRAL' };
  levels:  { support: number[]; resistance: number[]; nearestStopBelow: number | null };
  macro:   { dxy?: number | null; us10y?: number | null; vix?: number | null };
  regime:  { global: string; riskScore: number };
  news:    Array<{ title: string; impact: string; factuality: string; publishedAt: string }>;
  signals: Array<{ kind: string; at: string }>;
}

function pctChange(candles: Candle[], lookback: number): number | undefined {
  if (candles.length <= lookback) return undefined;
  const a = candles[candles.length - 1 - lookback]!.c;
  const b = candles[candles.length - 1]!.c;
  return ((b - a) / a) * 100;
}

function trendFrom(price: number, ind: IndicatorSnapshot): Trend {
  const above50  = ind.sma50  != null && price > ind.sma50;
  const above200 = ind.sma200 != null && price > ind.sma200;
  if (above50 && above200) return 'UP';
  if (!above50 && !above200) return 'DOWN';
  return 'SIDEWAYS';
}

function volRegime(bbWidthHistory: number[]): 'EXPANDING' | 'COMPRESSING' | 'NEUTRAL' {
  if (bbWidthHistory.length < 20) return 'NEUTRAL';
  const recent = bbWidthHistory.slice(-5);
  const older  = bbWidthHistory.slice(-25, -5);
  const r = recent.reduce((s, x) => s + x, 0) / recent.length;
  const o = older .reduce((s, x) => s + x, 0) / older .length;
  if (o === 0) return 'NEUTRAL';
  if (r / o > 1.2) return 'EXPANDING';
  if (r / o < 0.8) return 'COMPRESSING';
  return 'NEUTRAL';
}

export interface BuildFeaturesInput {
  asset: { symbol: string; class: string; name: string };
  tick: PriceTick;
  candles: Candle[];
  macro: { dxy?: number | null; us10y?: number | null; vix?: number | null };
  regime: { global: string; riskScore: number };
  news: Array<{ title: string; impact: string; factuality: string; publishedAt: string }>;
}

export function buildFeatures(input: BuildFeaturesInput): FeatureBag {
  const { asset, tick, candles, macro, regime, news } = input;
  const ind = computeIndicators(candles);
  const lv  = findLevels(candles);
  const structure = classifyStructure(candles);
  const direction = trendFrom(tick.price, ind);

  const closes = candles.map((c) => c.c);
  const bbHist = bollinger(closes, 20, 2);
  const widths = bbHist.upper.map((u, i) => (u != null && bbHist.lower[i] != null && bbHist.mid[i])
    ? (u - (bbHist.lower[i] as number)) / (bbHist.mid[i] as number) : null)
    .filter((x): x is number => x != null);

  const signals = detectSignals(candles, ind);

  const last = tick.price;
  const support = lv.support;
  const nearestStopBelow = support.length ? support[0]! : null;

  return {
    asset,
    price: { last, conf: tick.conf, stale: tick.stale, updatedAt: new Date(tick.publishTime * 1000).toISOString() },
    change: {
      h1: pctChange(candles, 1),
      h24: pctChange(candles, 1),  // daily candles → "h24" approximates 1-day
      d7: pctChange(candles, 7),
      d30: pctChange(candles, 30),
    },
    trend: { direction, structure, sma50: ind.sma50, sma200: ind.sma200, ema20: ind.ema20 },
    momentum: { rsi14: ind.rsi14, macd: ind.macd },
    volatility: {
      atr14: ind.atr14,
      atrPct: ind.atrPct,
      bbWidth: widths.length ? widths[widths.length - 1] ?? null : null,
      regime: volRegime(widths),
    },
    levels: { support, resistance: lv.resistance, nearestStopBelow },
    macro,
    regime,
    news,
    signals,
  };
}

function detectSignals(candles: Candle[], ind: IndicatorSnapshot): Array<{ kind: string; at: string }> {
  const out: Array<{ kind: string; at: string }> = [];
  const now = new Date().toISOString();
  const closes = candles.map((c) => c.c);
  if (closes.length < 51) return out;

  // MA50 cross
  const last = closes[closes.length - 1]!;
  const prev = closes[closes.length - 2]!;
  const s50 = sma(closes, 50);
  const s50Now  = s50[s50.length - 1];
  const s50Prev = s50[s50.length - 2];
  if (s50Now != null && s50Prev != null) {
    if (prev < s50Prev && last > s50Now) out.push({ kind: 'MA50_CROSS_UP', at: now });
    if (prev > s50Prev && last < s50Now) out.push({ kind: 'MA50_CROSS_DOWN', at: now });
  }

  // BB squeeze breakout
  if (ind.bb) {
    if (last > ind.bb.upper) out.push({ kind: 'BB_BREAKOUT_UP', at: now });
    if (last < ind.bb.lower) out.push({ kind: 'BB_BREAKOUT_DOWN', at: now });
  }

  // RSI extremes
  if (ind.rsi14 != null) {
    if (ind.rsi14 > 70) out.push({ kind: 'RSI_OVERBOUGHT', at: now });
    if (ind.rsi14 < 30) out.push({ kind: 'RSI_OVERSOLD',   at: now });
  }

  return out;
}

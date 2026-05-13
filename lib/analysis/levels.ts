import type { Candle } from '../types';

/**
 * Find recent swing pivots. A swing high at index i means c[i].h is the max
 * in [i-window, i+window]. Symmetric for lows.
 */
export function findSwings(candles: Candle[], window = 3): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = window; i < candles.length - window; i++) {
    let isHigh = true, isLow = true;
    const c = candles[i]!;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (candles[j]!.h >= c.h) isHigh = false;
      if (candles[j]!.l <= c.l) isLow  = false;
    }
    if (isHigh) highs.push(c.h);
    if (isLow)  lows.push(c.l);
  }
  return { highs, lows };
}

/** Cluster nearby levels into one (averaged). */
function cluster(levels: number[], tolerancePct = 0.5): number[] {
  if (levels.length === 0) return [];
  const sorted = [...levels].sort((a, b) => a - b);
  const out: number[][] = [[sorted[0]!]];
  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i]!;
    const last = out[out.length - 1]!;
    const avg = last.reduce((s, x) => s + x, 0) / last.length;
    if (Math.abs(v - avg) / avg * 100 <= tolerancePct) last.push(v);
    else out.push([v]);
  }
  return out.map((g) => g.reduce((s, x) => s + x, 0) / g.length);
}

export function findLevels(candles: Candle[]): { support: number[]; resistance: number[] } {
  const { highs, lows } = findSwings(candles, 3);
  const last = candles[candles.length - 1]?.c ?? 0;
  const above = cluster(highs.filter((h) => h > last), 0.7).sort((a, b) => a - b).slice(0, 5);
  const below = cluster(lows .filter((l) => l < last), 0.7).sort((a, b) => b - a).slice(0, 5);
  return { resistance: above, support: below };
}

/** Higher highs / lower lows over last N pivots. */
export function classifyStructure(candles: Candle[]): 'HIGHER_HIGHS_HIGHER_LOWS' | 'LOWER_HIGHS_LOWER_LOWS' | 'MIXED' {
  const { highs, lows } = findSwings(candles, 3);
  const recentHighs = highs.slice(-3);
  const recentLows  = lows .slice(-3);
  const inc = (arr: number[]) => arr.length >= 2 && arr.every((v, i, a) => i === 0 || v > a[i-1]!);
  const dec = (arr: number[]) => arr.length >= 2 && arr.every((v, i, a) => i === 0 || v < a[i-1]!);
  if (inc(recentHighs) && inc(recentLows)) return 'HIGHER_HIGHS_HIGHER_LOWS';
  if (dec(recentHighs) && dec(recentLows)) return 'LOWER_HIGHS_LOWER_LOWS';
  return 'MIXED';
}

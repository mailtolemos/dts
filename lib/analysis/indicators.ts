// Pure-function technical indicators. No deps.
import type { Candle } from '../types';

const closes = (c: Candle[]) => c.map((k) => k.c);

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  // Warm-up: simple average over first `period` values.
  let seedSum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (i < period - 1) { seedSum += v; out.push(null); continue; }
    if (i === period - 1) { seedSum += v; prev = seedSum / period; out.push(prev); continue; }
    prev = v * k + (prev as number) * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [null];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i]! - values[i - 1]!;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain; avgLoss += loss;
      if (i === period) {
        avgGain /= period; avgLoss /= period;
        const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
        out.push(100 - 100 / (1 + rs));
      } else { out.push(null); }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
      out.push(100 - 100 / (1 + rs));
    }
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signalP = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const line: (number | null)[] = values.map((_, i) => {
    const f = emaFast[i], s = emaSlow[i];
    return (f != null && s != null) ? f - s : null;
  });
  const lineClean = line.map((v) => v ?? 0);
  const signal = ema(lineClean, signalP);
  const hist: (number | null)[] = line.map((v, i) => {
    const s = signal[i];
    return (v != null && s != null) ? v - s : null;
  });
  return { line, signal, hist };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const out = { upper: [] as (number|null)[], mid, lower: [] as (number|null)[] };
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.upper.push(null); out.lower.push(null); continue; }
    let sumSq = 0;
    const m = mid[i] as number;
    for (let j = i - period + 1; j <= i; j++) sumSq += (values[j]! - m) ** 2;
    const sd = Math.sqrt(sumSq / period);
    out.upper.push(m + mult * sd);
    out.lower.push(m - mult * sd);
  }
  return out;
}

export function atr(candles: Candle[], period = 14): (number | null)[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    if (i === 0) { tr.push(c.h - c.l); continue; }
    const p = candles[i - 1]!;
    tr.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
  }
  // Wilder's smoothing.
  const out: (number | null)[] = [];
  let prev: number | null = null;
  let seed = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) { seed += tr[i]!; out.push(null); continue; }
    if (i === period - 1) { seed += tr[i]!; prev = seed / period; out.push(prev); continue; }
    prev = (((prev as number) * (period - 1)) + tr[i]!) / period;
    out.push(prev);
  }
  return out;
}

export interface IndicatorSnapshot {
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  rsi14: number | null;
  macd: { line: number; signal: number; hist: number } | null;
  bb: { upper: number; mid: number; lower: number } | null;
  atr14: number | null;
  atrPct: number | null;
}

export function computeIndicators(candles: Candle[]): IndicatorSnapshot {
  const c = closes(candles);
  const last = (arr: (number|null)[]) => arr.length ? arr[arr.length - 1] ?? null : null;
  const s50  = last(sma(c, 50));
  const s200 = last(sma(c, 200));
  const e20  = last(ema(c, 20));
  const r14  = last(rsi(c, 14));
  const m    = macd(c);
  const macdSnap = (last(m.line) != null && last(m.signal) != null && last(m.hist) != null)
    ? { line: last(m.line)!, signal: last(m.signal)!, hist: last(m.hist)! } : null;
  const b    = bollinger(c, 20, 2);
  const bbSnap = (last(b.upper) != null && last(b.mid) != null && last(b.lower) != null)
    ? { upper: last(b.upper)!, mid: last(b.mid)!, lower: last(b.lower)! } : null;
  const a14  = last(atr(candles, 14));
  const px   = c[c.length - 1] ?? null;
  const atrPct = (a14 != null && px != null) ? (a14 / px) * 100 : null;
  return { sma50: s50, sma200: s200, ema20: e20, rsi14: r14, macd: macdSnap, bb: bbSnap, atr14: a14, atrPct };
}

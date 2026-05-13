import type { PriceTick, Candle } from '../types';

// Deterministic-ish PRNG so mock prices are stable per symbol per minute.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function basePrice(symbol: string): number {
  const seeds: Record<string, number> = {
    BTC: 67000, ETH: 3500, SOL: 165, BNB: 600, XRP: 0.52, ADA: 0.42, DOGE: 0.16,
    AVAX: 30, LINK: 14, MATIC: 0.7, DOT: 7.1, TON: 6.5, SUI: 1.9, ARB: 0.85, OP: 1.8, ATOM: 8.2,
    SPX: 5800, NDX: 19500, RUT: 2200, DJI: 41000, VIX: 13.5,
    AAPL: 230, MSFT: 415, NVDA: 1180, AMZN: 195, TSLA: 245, META: 575, GOOG: 175, JPM: 220,
    XAU: 2620, XAG: 30.5, WTI: 71.0, BRENT: 75.0, NG: 2.7, HG: 4.05,
    EURUSD: 1.07, GBPUSD: 1.27, USDJPY: 153.2, USDCAD: 1.39, AUDUSD: 0.66, USDCHF: 0.89, DXY: 104.5,
    US10Y: 4.30, US02Y: 4.10,
  };
  return seeds[symbol] ?? 100;
}

export function mockTick(symbol: string, feedId: string): PriceTick {
  const base = basePrice(symbol);
  const t = Math.floor(Date.now() / 60_000);  // minute bucket
  const r = ((hash(symbol + ':' + t) % 1000) / 1000 - 0.5) * 0.02; // ±1%
  const price = base * (1 + r);
  const conf = price * 0.0002;
  return {
    feedId, symbol, price, conf,
    publishTime: Math.floor(Date.now() / 1000),
    stale: false, source: 'MOCK',
  };
}

export function mockCandles(symbol: string, count = 180): Candle[] {
  const base = basePrice(symbol);
  const out: Candle[] = [];
  let last = base * (0.85 + ((hash(symbol) % 100) / 100) * 0.3);
  const now = Math.floor(Date.now() / 1000);
  const step = 24 * 3600;
  for (let i = count; i > 0; i--) {
    const t = now - i * step;
    const driftBias = ((hash(symbol + ':drift') % 100) / 100 - 0.5) * 0.0015;
    const r1 = ((hash(symbol + ':' + i)     % 1000) / 1000 - 0.5) * 0.04 + driftBias;
    const r2 = ((hash(symbol + ':' + i + 'b') % 1000) / 1000 - 0.5) * 0.02;
    const o = last;
    const c = o * (1 + r1);
    const h = Math.max(o, c) * (1 + Math.abs(r2));
    const l = Math.min(o, c) * (1 - Math.abs(r2));
    out.push({ t, o, h, l, c });
    last = c;
  }
  return out;
}

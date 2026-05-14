import pThrottle from 'p-throttle';
import { env } from '../env';
import { logger } from '../logger';
import { ohlcCache } from '../cache';
import type { Candle } from '../types';

// CoinGecko free tier (10 RPM). Returns real data or empty array — no mocks.
const BASE = 'https://api.coingecko.com/api/v3';
const throttle = pThrottle({ limit: 10, interval: 60_000 });

function headers(): Record<string, string> {
  const k = env().COINGECKO_API_KEY;
  return k ? { 'x-cg-demo-api-key': k } : {};
}

// Symbol → CoinGecko id. Only crypto symbols are mapped; equities/FX/etc.
// return empty OHLC (use Pyth's own historical when we add it).
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin', XRP: 'ripple',
  ADA: 'cardano', DOGE: 'dogecoin', AVAX: 'avalanche-2', LINK: 'chainlink', MATIC: 'matic-network',
  DOT: 'polkadot', TON: 'the-open-network', SUI: 'sui', ARB: 'arbitrum', OP: 'optimism', ATOM: 'cosmos',
};

const _fetchOhlc = throttle(async (id: string, days: number): Promise<Candle[]> => {
  const url = `${BASE}/coins/${id}/ohlc?vs_currency=usd&days=${days}`;
  const r = await fetch(url, { headers: headers(), cache: 'no-store' });
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const arr = await r.json() as Array<[number, number, number, number, number]>;
  return arr.map(([t, o, h, l, c]) => ({ t: Math.floor(t / 1000), o, h, l, c }));
});

export async function getOhlc(symbol: string, days = 180): Promise<Candle[]> {
  const key = `cg:${symbol}:${days}`;
  const cached = ohlcCache.get(key) as Candle[] | undefined;
  if (cached) return cached;

  const id = COINGECKO_IDS[symbol];
  if (!id) {
    // Not a CoinGecko-mapped symbol. Return empty rather than mock data.
    return [];
  }

  try {
    const data = await _fetchOhlc(id, days);
    ohlcCache.set(key, data);
    return data;
  } catch (err) {
    logger.warn({ err: String(err), symbol }, 'coingecko OHLC failed');
    // Cache the empty result briefly so we don't hammer on rate-limit errors.
    ohlcCache.set(key, [], 30_000);
    return [];
  }
}

export async function health(): Promise<{ ok: boolean; lastError?: string }> {
  try {
    const r = await fetch(`${BASE}/ping`, { headers: headers(), cache: 'no-store' });
    return { ok: r.ok };
  } catch (err) {
    return { ok: false, lastError: String(err) };
  }
}

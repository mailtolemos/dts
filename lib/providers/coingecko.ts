import pThrottle from 'p-throttle';
import { env, flags } from '../env';
import { logger } from '../logger';
import { ohlcCache } from '../cache';
import type { Candle } from '../types';
import { mockCandles } from './mock';

// CoinGecko free tier is enough for v1 OHLC on crypto.
const BASE = 'https://api.coingecko.com/api/v3';
const throttle = pThrottle({ limit: 10, interval: 60_000 });  // free tier: ~10 rpm

function headers(): Record<string, string> {
  const k = env().COINGECKO_API_KEY;
  return k ? { 'x-cg-demo-api-key': k } : {};
}

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
    const m = mockCandles(symbol, days);
    ohlcCache.set(key, m);
    return m;
  }

  try {
    const data = await _fetchOhlc(id, days);
    ohlcCache.set(key, data);
    return data;
  } catch (err) {
    logger.warn({ err: String(err), symbol }, 'coingecko OHLC failed; using mock');
    const m = mockCandles(symbol, days);
    ohlcCache.set(key, m, 60_000);
    return m;
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

export const hasKey = () => flags.hasGroq /* not relevant */ || true;

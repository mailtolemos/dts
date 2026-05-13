import pThrottle from 'p-throttle';
import { env, flags } from '../env';
import { logger } from '../logger';
import { priceCache } from '../cache';
import type { PriceTick } from '../types';
import { mockTick } from './mock';

// Subset of Pyth Hermes catalog. Real seed pulls full list at install time.
export interface PythFeed {
  id: string;             // hex feed id
  symbol: string;         // e.g. "Crypto.BTC/USD"
  displaySymbol: string;  // "BTC/USD"
  assetType: 'crypto' | 'equity' | 'fx' | 'metal' | 'rates' | 'commodities';
}

const throttle = pThrottle({ limit: 20, interval: 1_000 });

function authHeaders(): Record<string, string> {
  const key = env().PYTH_API_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

interface HermesPriceUpdate {
  id: string;
  price: { price: string; conf: string; expo: number; publish_time: number };
  ema_price?: { price: string; conf: string; expo: number; publish_time: number };
}

const _fetchLatest = throttle(async (ids: string[]): Promise<HermesPriceUpdate[]> => {
  const params = new URLSearchParams();
  ids.forEach((id) => params.append('ids[]', id));
  const url = `${env().PYTH_HERMES_URL}/v2/updates/price/latest?${params.toString()}`;
  const r = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
  if (!r.ok) {
    throw new Error(`pyth ${r.status} ${await r.text().catch(() => '')}`);
  }
  const json = await r.json() as { parsed?: HermesPriceUpdate[] };
  return json.parsed ?? [];
});

function normalize(u: HermesPriceUpdate, symbol: string): PriceTick {
  const scale = Math.pow(10, u.price.expo);
  const price = Number(u.price.price) * scale;
  const conf  = Number(u.price.conf)  * scale;
  const ageS  = Math.floor(Date.now() / 1000) - u.price.publish_time;
  const stale = ageS > 30 || conf / Math.max(price, 1) > 0.005;
  return {
    feedId: u.id,
    symbol,
    price,
    conf,
    publishTime: u.price.publish_time,
    stale,
    source: 'PYTH',
  };
}

export interface FeedLookup { feedId: string; symbol: string }

/** Fetch latest ticks for a list of feeds. Falls back to mock per-feed if Pyth fails. */
export async function getLatest(feeds: FeedLookup[]): Promise<PriceTick[]> {
  if (feeds.length === 0) return [];
  // Serve cached ticks first.
  const need: FeedLookup[] = [];
  const out: PriceTick[] = [];
  for (const f of feeds) {
    const cached = priceCache.get(`pyth:${f.feedId}`) as PriceTick | undefined;
    if (cached) out.push(cached); else need.push(f);
  }
  if (need.length === 0) return out;

  try {
    // Batch into 50-id chunks.
    const chunks: FeedLookup[][] = [];
    for (let i = 0; i < need.length; i += 50) chunks.push(need.slice(i, i + 50));
    for (const chunk of chunks) {
      const updates = await _fetchLatest(chunk.map((c) => c.feedId));
      const bySymbol = new Map(chunk.map((c) => [c.feedId.toLowerCase(), c.symbol]));
      for (const u of updates) {
        const sym = bySymbol.get(u.id.toLowerCase()) ?? u.id;
        const tick = normalize(u, sym);
        priceCache.set(`pyth:${tick.feedId}`, tick, 1_000);
        out.push(tick);
      }
    }
    return out;
  } catch (err) {
    logger.warn({ err: String(err) }, 'pyth getLatest failed; returning mocks');
    return [...out, ...need.map((f) => mockTick(f.symbol, f.feedId))];
  }
}

/** Subscribe to Pyth SSE. Returns an unsubscribe function. */
export function streamTicks(
  feeds: FeedLookup[],
  onTick: (t: PriceTick) => void,
): () => void {
  if (feeds.length === 0) return () => {};
  if (!flags.hasPyth && env().NODE_ENV !== 'production') {
    // Dev/mock mode: emit random walks every 2s.
    const interval = setInterval(() => {
      for (const f of feeds) onTick(mockTick(f.symbol, f.feedId));
    }, 2_000);
    return () => clearInterval(interval);
  }

  // Lazy-load eventsource (it's a Node lib, not browser).
  let closed = false;
  let es: { close(): void } | null = null;

  (async () => {
    try {
      const { default: EventSource } = await import('eventsource');
      const params = new URLSearchParams();
      feeds.forEach((f) => params.append('ids[]', f.feedId));
      const url = `${env().PYTH_HERMES_URL}/v2/updates/price/stream?${params.toString()}`;
      const e = new EventSource(url, { headers: authHeaders() } as never);
      es = e;
      const bySymbol = new Map(feeds.map((f) => [f.feedId.toLowerCase(), f.symbol]));
      e.onmessage = (evt: MessageEvent) => {
        if (closed) return;
        try {
          const payload = JSON.parse(evt.data) as { parsed?: HermesPriceUpdate[] };
          for (const u of payload.parsed ?? []) {
            const sym = bySymbol.get(u.id.toLowerCase()) ?? u.id;
            onTick(normalize(u, sym));
          }
        } catch (err) {
          logger.warn({ err: String(err) }, 'pyth stream parse failed');
        }
      };
      e.onerror = (err: unknown) => {
        logger.warn({ err: String(err) }, 'pyth stream error');
      };
    } catch (err) {
      logger.error({ err: String(err) }, 'pyth stream init failed');
    }
  })();

  return () => {
    closed = true;
    es?.close();
  };
}

/** Health check used by /api/admin/health. */
export async function health(): Promise<{ ok: boolean; lastError?: string }> {
  try {
    await fetch(`${env().PYTH_HERMES_URL}/v2/price_feeds?asset_type=crypto&query=btc`, {
      headers: authHeaders(),
      cache: 'no-store',
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, lastError: String(err) };
  }
}

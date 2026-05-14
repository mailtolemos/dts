import pThrottle from 'p-throttle';
import { env, flags } from '../env';
import { logger } from '../logger';
import { priceCache } from '../cache';
import type { PriceTick } from '../types';

// Pyth Hermes price feed client. Real data only — no mocks.
//
// Free public Hermes works without a key (rate-limited). Pyth Pro key
// (PYTH_API_KEY) extends limits and is sent as Authorization: Bearer.

const throttle = pThrottle({ limit: 20, interval: 1_000 });

function authHeaders(): Record<string, string> {
  const key = env().PYTH_API_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

export interface HermesFeedRow {
  id: string;
  attributes: {
    asset_type: string;
    base: string;
    quote_currency: string;
    description: string;
    display_symbol: string;
    symbol: string;
    country?: string;
    schedule?: string;
  };
}

interface HermesPriceUpdate {
  id: string;
  price: { price: string; conf: string; expo: number; publish_time: number };
}

// === Latest prices ===

const _fetchLatest = throttle(async (ids: string[]): Promise<HermesPriceUpdate[]> => {
  const params = new URLSearchParams();
  ids.forEach((id) => params.append('ids[]', id));
  const url = `${env().PYTH_HERMES_URL}/v2/updates/price/latest?${params.toString()}`;
  const r = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
  if (!r.ok) throw new Error(`pyth ${r.status} ${await r.text().catch(() => '')}`);
  const json = await r.json() as { parsed?: HermesPriceUpdate[] };
  return json.parsed ?? [];
});

function normalize(u: HermesPriceUpdate, symbol: string): PriceTick {
  const scale = Math.pow(10, u.price.expo);
  const price = Number(u.price.price) * scale;
  const conf = Number(u.price.conf) * scale;
  const ageS = Math.floor(Date.now() / 1000) - u.price.publish_time;
  const stale = ageS > 60 || conf / Math.max(price, 1) > 0.005;
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

/** Fetch latest ticks for a list of feeds. Returns only feeds that succeeded. */
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

  // Batch into 50-id chunks; Pyth accepts up to 50 ids/request.
  const chunks: FeedLookup[][] = [];
  for (let i = 0; i < need.length; i += 50) chunks.push(need.slice(i, i + 50));

  // Run chunks in parallel.
  const results = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const updates = await _fetchLatest(chunk.map((c) => c.feedId));
      const bySymbol = new Map(chunk.map((c) => [c.feedId.toLowerCase(), c.symbol]));
      const ticks: PriceTick[] = [];
      for (const u of updates) {
        const sym = bySymbol.get(u.id.toLowerCase()) ?? u.id;
        const tick = normalize(u, sym);
        priceCache.set(`pyth:${tick.feedId}`, tick, 1_000);
        ticks.push(tick);
      }
      return ticks;
    }),
  );
  for (const r of results) {
    if (r.status === 'fulfilled') out.push(...r.value);
    else logger.warn({ err: String(r.reason) }, 'pyth chunk failed');
  }
  return out;
}

// === Catalog ===

/**
 * Fetch the full Pyth price-feed catalog from Hermes. Used by the catalog
 * sync cron + seed.
 */
export async function listAllFeeds(): Promise<HermesFeedRow[]> {
  const url = `${env().PYTH_HERMES_URL}/v2/price_feeds`;
  const r = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
  if (!r.ok) throw new Error(`pyth catalog ${r.status}`);
  return (await r.json()) as HermesFeedRow[];
}

// === Streaming ===

/** Subscribe to Pyth SSE. Returns an unsubscribe function. */
export function streamTicks(
  feeds: FeedLookup[],
  onTick: (t: PriceTick) => void,
): () => void {
  if (feeds.length === 0) return () => {};

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
    const r = await fetch(`${env().PYTH_HERMES_URL}/v2/price_feeds?asset_type=crypto&query=btc`, {
      headers: authHeaders(),
      cache: 'no-store',
    });
    return { ok: r.ok, lastError: r.ok ? undefined : `status ${r.status}` };
  } catch (err) {
    return { ok: false, lastError: String(err) };
  }
}

export { flags };

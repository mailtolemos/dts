// Simple in-process TTL cache. Good enough for v1.
// Swap to Redis by replacing the get/set body.

type Entry<V> = { value: V; expiresAt: number };

export class TtlCache<K, V> {
  private store = new Map<K, Entry<V>>();

  constructor(private defaultTtlMs: number = 60_000, private max: number = 5000) {}

  get(key: K): V | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    if (this.store.size >= this.max) {
      // Drop the oldest entry. Map preserves insertion order.
      const firstKey = this.store.keys().next().value as K | undefined;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  delete(key: K): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  get size(): number { return this.store.size; }
}

// Convenience helper for async memoization.
export async function memoize<V>(
  cache: TtlCache<string, V>,
  key: string,
  ttlMs: number,
  loader: () => Promise<V>,
): Promise<V> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = await loader();
  cache.set(key, value, ttlMs);
  return value;
}

// Singletons (per-process).
export const priceCache  = new TtlCache<string, unknown>(1_000);    // 1s
export const ohlcCache   = new TtlCache<string, unknown>(300_000);  // 5min
export const newsCache   = new TtlCache<string, unknown>(300_000);
export const cardCache   = new TtlCache<string, unknown>(900_000);  // 15min
export const macroCache  = new TtlCache<string, unknown>(86_400_000); // 24h

# DTS — Pyth Network Integration

## Why Pyth
First-party, high-frequency price oracle covering crypto, equities, FX, commodities, indexes. Each update ships with a **confidence interval** — the analyst should treat any feed whose `confidence / price > 0.5%` as degraded.

## Endpoints we use

**Hermes (REST + SSE)** — `https://hermes.pyth.network`
- `GET /v2/price_feeds?query=&asset_type=crypto` — feed catalog.
- `GET /v2/updates/price/latest?ids[]=…` — latest prices for N feeds.
- `GET /v2/updates/price/stream?ids[]=…` — SSE stream of price updates.

The user's "Pyth Pro" key (if applicable) is sent as `Authorization: Bearer ${PYTH_API_KEY}`. The public Hermes endpoint also works without a key, with stricter rate limits — our client transparently uses whichever is configured.

## Client design (`lib/providers/pyth.ts`)

```ts
export interface PythPrice {
  feedId: string;
  symbol: string;
  price: number;
  conf: number;
  expo: number;       // price = rawPrice * 10^expo
  publishTime: number; // unix seconds
}

export interface PythProvider {
  listFeeds(query?: { assetType?: string; q?: string }): Promise<PythFeed[]>;
  getLatest(feedIds: string[]): Promise<PythPrice[]>;
  stream(feedIds: string[], onTick: (p: PythPrice) => void): () => void; // returns unsubscribe
  health(): Promise<{ ok: boolean; lastError?: string }>;
}
```

Implementation notes:
- `getLatest` batches into chunks of 50 ids.
- `stream` uses native `EventSource` (server-side via `eventsource` npm). On disconnect, exponential backoff (1s → 30s cap) and re-subscribe.
- Returned `price` is already normalized: `rawPrice * 10^expo`.
- All calls wrapped in `p-throttle` (default 20 rps) and an LRU (`feedId → tick`) with 1s TTL.

## Feed catalog & seed list

`scripts/seed.ts` seeds the asset universe. v1 catalog:

**Crypto:** BTC, ETH, SOL, XRP, BNB, ADA, AVAX, DOGE, LINK, MATIC, DOT, TON, SUI, ARB, OP, ATOM
**Equity indexes:** SPX, NDX, RUT, DJI, VIX
**Equities (Pyth coverage):** AAPL, MSFT, NVDA, AMZN, TSLA, META, GOOG, JPM
**Commodities:** XAU (gold), XAG (silver), WTI (oil), BRENT, NG (natgas), HG (copper)
**FX:** EURUSD, GBPUSD, USDJPY, USDCAD, AUDUSD, USDCHF, DXY
**Rates (where available):** US10Y, US02Y

For each, we store the Pyth `feed_id` (hex). Seed file pulls the catalog from Hermes at install time so we don't hardcode IDs that can change.

## Confidence handling

Display logic:
- `conf / price < 0.05%`: green (normal).
- `0.05% – 0.5%`: amber (wide).
- `> 0.5%` OR `now - publishTime > 30s`: red, marked **stale**, and the analyst pipeline skips this feed for that cycle.

## Fallback

If Pyth is unreachable for > 60s on a given feed, we fall back to:
- **Crypto:** CoinGecko `/simple/price`.
- **Equities/Indexes/Commodities:** Polygon if `POLYGON_API_KEY` is set, else mock provider (deterministic random walk seeded by symbol — visibly labeled `MOCK` in the UI).
- **FX:** Frankfurter API (free, ECB-based).

Fallback price rows show a small badge indicating the source.

## SSE bridge to the UI

The Next.js `GET /api/stream` endpoint subscribes to Pyth's SSE on behalf of the client and rebroadcasts only the feeds the client asked for. This:
- Hides the Pyth key (never crosses the client boundary).
- Lets us multiplex many client subscribers over one upstream subscription.
- Allows us to inject our own derived events (`card`, `alert`) into the same stream.

## Pyth Pro key handling

`PYTH_API_KEY` is read in `lib/env.ts`. The provider only adds the auth header if the key is set. **Never** include it in any object that crosses to a client component or any `app/api/*` response payload. CI grep guards `process.env.PYTH_API_KEY` from appearing in `.next/static/**`.

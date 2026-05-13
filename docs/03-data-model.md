# DTS — Data Model

## Entity map

```
User ──< Favorite >── Asset ──< PriceFeed
  └─< Watchlist >── WatchlistItem >── Asset
  └─< Alert         Asset ──< AiAnalysis
                    Asset ──< NewsItem (M:N via NewsAssetLink)
                              MarketSnapshot (global)
                              SignalHistory
                              SystemLog
```

## Tables

### User
- `id` cuid
- `email` unique nullable (v1 single-user mode allowed)
- `displayName` string?
- `prefs` jsonb — `{ defaultAssetClass, theme, alertChannel }`
- `createdAt`

### Asset
Canonical asset record. Many price feeds may reference one asset (e.g., BTC across exchanges).
- `id` cuid
- `symbol` unique (e.g., `BTC`, `ETH`, `SPX`, `XAU`, `EURUSD`)
- `name` (e.g., `Bitcoin`)
- `assetClass` enum: `CRYPTO | EQUITY | INDEX | COMMODITY | FX | RATE`
- `metadata` jsonb — sector/country/coingeckoId/etc.

### PriceFeed
One Pyth feed.
- `id` cuid
- `assetId` fk → Asset
- `providerId` string (Pyth feed id, e.g. `0xe62df...`)
- `provider` enum: `PYTH | COINGECKO | MOCK`
- `displaySymbol` (e.g., `BTC/USD`)
- `decimals` int
- `active` bool

### Favorite
- `userId` fk
- `assetId` fk
- composite PK (userId, assetId)
- `createdAt`

### Watchlist
- `id` cuid
- `userId` fk
- `name`
- `order` int

### WatchlistItem
- `watchlistId` fk
- `assetId` fk
- `order` int
- composite PK (watchlistId, assetId)

### Alert
- `id` cuid
- `userId` fk
- `assetId` fk?
- `type` enum: `PRICE_CROSS | PCT_MOVE | VOL_EXPANSION | THESIS_CHANGE | TREND_CHANGE | NEWS_EVENT`
- `params` jsonb — `{ level, direction, window, threshold, ... }`
- `enabled` bool
- `lastTriggeredAt` ts?
- `createdAt`

### AlertEvent
History of triggers.
- `id` cuid
- `alertId` fk
- `firedAt` ts
- `payload` jsonb

### MarketSnapshot
Global market state, generated periodically.
- `id` cuid
- `at` ts (indexed)
- `regime` enum
- `riskScore` float (-1..1, -1 = risk-off, +1 = risk-on)
- `vix` float?
- `dxy` float?
- `btcDominance` float?
- `summary` text — short LLM narrative
- `inputs` jsonb — raw features fed to the regime detector

### AssetSnapshot
Per-asset feature snapshot used to feed AI + alerts.
- `id` cuid
- `assetId` fk
- `at` ts (indexed: (assetId, at desc))
- `last` float
- `change24h` float?
- `rsi14` float?
- `macd` jsonb — `{ line, signal, hist }`
- `atr14` float?
- `bb` jsonb — `{ upper, mid, lower }`
- `sma50` float? `sma200` float? `ema20` float?
- `trend` enum: `UP | DOWN | SIDEWAYS`
- `levels` jsonb — `{ supports: [], resistances: [] }`
- `features` jsonb — full feature bag for audit

### AiAnalysis
The indication card.
- `id` cuid
- `assetId` fk
- `at` ts (indexed)
- `bias` enum: `BULLISH | BEARISH | NEUTRAL | WATCH`
- `horizon` enum: `INTRADAY | SWING | MULTIWEEK`
- `confidence` enum: `LOW | MEDIUM | HIGH`
- `reasoning` text
- `keyLevels` jsonb — `{ support: [], resistance: [], invalidation: number }`
- `riskNotes` text
- `whatChangesView` text
- `sourcesUsed` jsonb — array of provider names/ids
- `model` string (e.g., `groq:llama-3.3-70b-versatile`)
- `inputsHash` string — for dedupe / regen detection

### NewsItem
- `id` cuid
- `url` unique
- `source` string (e.g., `cryptopanic`, `reuters`)
- `title` text
- `summary` text?
- `publishedAt` ts (indexed)
- `impact` enum: `LOW | MEDIUM | HIGH`
- `factuality` enum: `CONFIRMED | REPORTED | RUMOR | OPINION`
- `secondOrder` text?  — LLM-written second-order effects line
- `embedding` bytes? (optional, later)

### NewsAssetLink
M:N between news and assets.
- `newsItemId` fk
- `assetId` fk
- `weight` float (0..1)
- composite PK

### SignalHistory
Pre-LLM, deterministic signals (breakouts, MA crosses, vol expansions). Useful for backtest-style review and for the alerts engine.
- `id` cuid
- `assetId` fk
- `kind` string (e.g., `MA50_CROSS_UP`)
- `at` ts
- `payload` jsonb

### SystemLog
- `id` cuid
- `level` enum: `INFO | WARN | ERROR`
- `source` string
- `message` text
- `meta` jsonb
- `at` ts

## Indexes

- `Asset.symbol` unique
- `PriceFeed.providerId` unique
- `AssetSnapshot (assetId, at DESC)` for latest feature lookup
- `AiAnalysis (assetId, at DESC)` for latest card
- `NewsItem.publishedAt DESC`
- `MarketSnapshot.at DESC`

## Retention

- `AssetSnapshot`: keep 90 days raw, then daily-roll up.
- `AiAnalysis`: keep all (small).
- `NewsItem`: keep 30 days; high-impact items kept indefinitely.
- `SystemLog`: 14 days.

See `prisma/schema.prisma` for the executable version.

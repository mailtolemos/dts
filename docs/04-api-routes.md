# DTS — API Surface

All routes return JSON. Errors use `{ ok: false, error: { code, message } }`. Success uses the data shape directly, or `{ ok: true, data: ... }` for write endpoints. All times are ISO-8601 UTC.

## REST

### `GET /api/dashboard`
Global market state.
```ts
{
  at: string;
  regime: 'RISK_ON'|'RISK_OFF'|'CHOPPY'|'VOL_EXPANSION'|'VOL_COMPRESSION'|'CRYPTO_LED'|'EQUITY_LED'|'MACRO_LED'|'NEWS_DRIVEN';
  riskScore: number;          // -1..1
  summary: string;            // AI narrative
  classes: {
    crypto:     { topMovers: AssetTile[]; aggChange24h: number };
    equityIdx:  { topMovers: AssetTile[]; aggChange24h: number };
    commodity:  { topMovers: AssetTile[]; aggChange24h: number };
    fx:         { topMovers: AssetTile[]; aggChange24h: number };
  };
  vol: { vix?: number; dxy?: number; btcImpliedVol?: number };
}
```

### `GET /api/feeds?class=CRYPTO&q=btc&page=1`
Paginated feed list.
```ts
{
  total: number;
  page: number;
  items: Array<{
    symbol: string; name: string; assetClass: AssetClass;
    last: number; conf: number; pctChange24h?: number;
    updatedAt: string;
    feedId: string;
  }>;
}
```

### `GET /api/asset/:symbol`
Asset detail bundle.
```ts
{
  asset: { symbol, name, assetClass, metadata };
  price: { last, conf, updatedAt };
  ohlc?: Array<{ t: number; o:number; h:number; l:number; c:number; v?:number }>;
  indicators: {
    sma50?: number; sma200?: number; ema20?: number;
    rsi14?: number; macd?: { line:number; signal:number; hist:number };
    bb?: { upper:number; mid:number; lower:number }; atr14?: number;
  };
  levels: { support: number[]; resistance: number[] };
  trend: 'UP'|'DOWN'|'SIDEWAYS';
  news: NewsItem[];
  card?: AiAnalysisCard;
}
```

### `GET /api/cards?asset=BTC&horizon=SWING&limit=20`
Indication card stream.
```ts
{ items: AiAnalysisCard[] }
```

### `POST /api/cards/regenerate` (admin / authorized)
Force re-run AI analyst for an asset.
Body: `{ symbol: string }` → `{ ok, card }`.

### `GET /api/news?asset=BTC&impact=HIGH&limit=20`
```ts
{ items: NewsItem[] }
```

### `GET /api/watchlists`
`POST /api/watchlists` — create  body `{ name }`
`PATCH /api/watchlists/:id` — rename/reorder
`DELETE /api/watchlists/:id`
`POST /api/watchlists/:id/items` body `{ symbol }`
`DELETE /api/watchlists/:id/items/:symbol`

### `GET /api/favorites`
`POST /api/favorites` body `{ symbol }`
`DELETE /api/favorites/:symbol`

### `GET /api/alerts`
`POST /api/alerts` body matches `Alert.params` schema
`PATCH /api/alerts/:id`
`DELETE /api/alerts/:id`
`GET  /api/alerts/:id/events`

### `GET /api/admin/health`
Provider status (last successful call, error counts).
```ts
{
  providers: Array<{ name:string; ok:boolean; lastOkAt?:string; lastError?:string }>;
  worker: { lastRunAt?:string; nextRunAt?:string; status:'IDLE'|'RUNNING'|'ERROR' };
}
```

### `PATCH /api/admin/settings`
Update refresh interval, AI model, etc. (env-locked fields stay env-locked.)

## Realtime — SSE

### `GET /api/stream?topics=price:BTC,price:ETH,cards:BTC`
Server-Sent Events. Each event:
```
event: price
data: {"symbol":"BTC","last":67341.2,"conf":12.4,"at":"..."}

event: card
data: { ... AiAnalysisCard ... }

event: alert
data: { alertId, symbol, kind, payload, at }
```

Client reconnects with `Last-Event-ID`. Server keeps a per-process ring buffer (1024 events) for replay.

## Auth

v1 single-user mode: a single `DTS_USER_EMAIL` env defines the implicit user; all `userId`-scoped routes operate on that user.
Multi-user mode (flag `AUTH_ENABLED=1`): NextAuth email magic-link. All routes require a valid session cookie; `/api/admin/*` requires `role=admin` in `User.prefs`.

## Rate limiting

- `/api/*` IP-bucket: 60 req / min default, 10 req / min for `/api/cards/regenerate`.
- 429 response includes `Retry-After`.

## Error codes

`PROVIDER_DOWN`, `ASSET_NOT_FOUND`, `RATE_LIMITED`, `BAD_REQUEST`, `UNAUTHORIZED`, `INTERNAL`. Each code maps to a fixed HTTP status.

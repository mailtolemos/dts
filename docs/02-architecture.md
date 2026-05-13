# DTS — Technical Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) + React Server Components + TypeScript | One codebase, server actions for mutations, streaming UI, deploys to Vercel cheaply. |
| Styling | Tailwind CSS + small in-house token set | No CSS-in-JS runtime cost; trading UIs need dense, fast styles. |
| Charts | `lightweight-charts` (TradingView OSS) | Industry-standard look, performant, free. |
| Realtime | Server-Sent Events (SSE) | Simpler than WebSockets for one-way price/event push; works behind Vercel edge. |
| ORM | Prisma | Type-safe queries, easy migrations, mature. |
| Database | Postgres (Neon or Supabase) | Relational + JSONB for flexible AI/news payloads. |
| Cache | In-process LRU + optional Upstash Redis | Free tier covers v1; Redis ready to plug in when traffic grows. |
| Background jobs | `tsx scripts/worker.ts` (long-running) for dev; Vercel cron + Upstash QStash for prod | Splits the latency-bound web tier from the periodic AI/alert work. |
| LLM | Groq (Llama 3.3 70B) via OpenAI-compatible SDK | Free, fast (sub-second), structured-output capable. Abstracted so swap to Anthropic/OpenAI is one file. |
| Auth | NextAuth (email magic link, optional) | Stubbed in v1 as a single-user mode; flag to enable. |
| Hosting | Vercel (web) + Neon (DB) + Fly.io or Render (worker) | All have generous free tiers. |
| Observability | Pino (structured logs) + Vercel logs + optional Sentry | Cheap, sufficient. |

### Tradeoffs explicitly considered

- **Monolith vs split backend.** We picked monolith Next.js. Pro: one repo, one deploy, simpler. Con: the worker process can't share the request lifecycle with Next; we run it as a separate Node process that imports the same `lib/`. Easy to extract later.
- **SSE vs WebSocket.** SSE is one-way (server → client) and is enough for price ticks + alert push. If we add two-way features (collaborative watchlists, in-app chat), revisit WS.
- **Prisma vs Drizzle.** Prisma's DX is friendlier for a project where the schema is still moving; Drizzle is slimmer at runtime. Prisma wins for v1.
- **Groq vs Anthropic/OpenAI.** Groq is free-tier-generous and very fast, which matters because the analyst runs on a schedule. We isolate it behind an `LlmClient` interface — swapping is trivial.

## Runtime topology

```
                ┌──────────────────────┐
                │   Browser (Next.js)  │
                │   - Dashboard / Feeds│
                │   - Asset detail     │
                │   - SSE subscriber   │
                └─────────┬────────────┘
                          │ HTTPS
                ┌─────────▼────────────────────┐
                │   Next.js server             │
                │   - app/api/*  (REST)        │
                │   - app/api/stream (SSE)     │
                │   - server actions           │
                │   - lib/ providers + AI      │
                └─────┬───────┬───────┬────────┘
                      │       │       │
       ┌──────────────▼─┐   ┌─▼────┐ ┌▼──────────────────┐
       │ Postgres (Neon)│   │Cache │ │ External providers │
       │ Prisma         │   │LRU/  │ │ Pyth Hermes        │
       │                │   │Redis │ │ CoinGecko          │
       └────────────────┘   └──────┘ │ Cryptopanic        │
                                     │ FRED, sentiment    │
                                     │ Groq LLM           │
                                     └────────────────────┘
                          ▲
                          │ HTTPS (same lib/)
                ┌─────────┴────────────────────┐
                │   Worker process (node)      │
                │   - refresh snapshots        │
                │   - run AI analyst           │
                │   - evaluate alerts          │
                │   - news ingest + classify   │
                └──────────────────────────────┘
```

## Module layout

```
dts/
├─ app/                       # Next.js App Router
│  ├─ (marketing)/            # public landing (optional)
│  ├─ dashboard/page.tsx
│  ├─ feeds/page.tsx
│  ├─ asset/[symbol]/page.tsx
│  ├─ analyst/page.tsx
│  ├─ news/page.tsx
│  ├─ alerts/page.tsx
│  ├─ admin/page.tsx
│  └─ api/
│     ├─ feeds/route.ts
│     ├─ asset/[symbol]/route.ts
│     ├─ dashboard/route.ts
│     ├─ cards/route.ts
│     ├─ news/route.ts
│     ├─ alerts/route.ts
│     ├─ watchlists/route.ts
│     └─ stream/route.ts      # SSE
├─ components/                # UI primitives + composed
├─ lib/
│  ├─ providers/              # pyth.ts, coingecko.ts, cryptopanic.ts, fred.ts, sentiment.ts
│  ├─ analysis/               # indicators.ts, regime.ts, features.ts, levels.ts
│  ├─ ai/                     # groq.ts (client), analyst.ts (prompt + parse), news.ts
│  ├─ alerts/                 # rules.ts, evaluator.ts
│  ├─ cache.ts                # LRU + ttl
│  ├─ db.ts                   # prisma client singleton
│  ├─ env.ts                  # zod-validated env
│  ├─ logger.ts
│  └─ types.ts                # shared zod schemas
├─ prisma/schema.prisma
├─ scripts/
│  ├─ worker.ts               # periodic jobs
│  ├─ seed.ts                 # asset universe
│  └─ check-types.ts          # tsc --noEmit wrapper
├─ public/
├─ .env.example
├─ next.config.js
├─ tailwind.config.ts
├─ tsconfig.json
├─ package.json
└─ README.md
```

## Caching strategy

| Resource | TTL | Layer |
|---|---|---|
| Pyth price (per feed) | 1s | in-process LRU; SSE pushes ticks |
| OHLC daily | 6 h | LRU + DB snapshot |
| OHLC intraday | 5 min | LRU |
| News list | 5 min | LRU |
| AI indication card per asset | 15 min | DB row + LRU |
| Regime score | 5 min | LRU |
| FRED macro series | 24 h | DB |

## Secrets

All keys (`PYTH_API_KEY`, `GROQ_API_KEY`, `CRYPTOPANIC_API_KEY`, `FRED_API_KEY`, `DATABASE_URL`) live in `.env.local` (dev) or Vercel env vars (prod). `lib/env.ts` validates on boot with zod; missing optional keys fall back to mock providers, missing required keys crash on boot with a clear error.

The frontend bundle is checked for `process.env.*_KEY` leakage in CI (simple grep).

## Rate-limit protection

- Each external client wraps fetch with `p-throttle` (configurable rps).
- Per-route Next.js middleware enforces a basic IP token-bucket on `/api/*`.
- LLM client has a per-minute call cap + exponential backoff on 429.

## Error handling

- All `app/api/*` routes return `{ ok: false, error: { code, message } }` on failure; never leak stack traces.
- Provider clients use `Result<T, ProviderError>` style returns; analysis code never throws on missing data, it degrades.
- UI shows skeleton → empty state → error state in that order.

## Logging

- `pino` with redaction for keys.
- Worker logs job name, duration, count of items processed.
- Web logs request id, route, status, duration.

## Performance targets

- Dashboard SSR: < 600 ms uncached, < 200 ms warm.
- Feeds list initial paint: < 800 ms.
- Asset detail (without chart hydration): < 1000 ms.
- SSE tick latency: < 1 s end-to-end on local dev.

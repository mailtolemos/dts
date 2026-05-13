# DTS — Degening the Situation

AI-powered market intelligence across crypto, equities, indexes, commodities, and FX.

This is the v0.1 scaffold: spec + architecture docs in `docs/`, and a runnable Next.js app + worker that integrate Pyth Network, CoinGecko, Cryptopanic, FRED, alternative.me and Groq (free LLM).

> Market intelligence and decision support. Not financial advice. Every analysis includes risk, uncertainty, and invalidation.

## What's inside

```
docs/                Product spec, architecture, data model, API, Pyth, AI pipeline, alerts, deployment.
app/                 Next.js App Router pages + API routes
components/          UI primitives (Panel, Pill, AssetRow, IndicationCard, PriceChart, RegenButton, AlertForm)
lib/
  providers/         pyth, coingecko, cryptopanic, fred, sentiment, mock
  analysis/          indicators, levels, regime, features
  ai/                groq client, analyst (card generation), news classifier
  alerts/            evaluator, in-process pub/sub bus
  services/market.ts Composition layer used by API routes + worker
prisma/schema.prisma Database schema
scripts/
  seed.ts            Seeds asset universe + default user/watchlist
  worker.ts          Long-running background process for snapshots, AI, news, alerts
docker-compose.yml   Local Postgres
```

Read `docs/01-product-spec.md` first, then `docs/02-architecture.md`. The rest follow in numeric order.

## Quick start

```bash
# 1. Install
pnpm install   # or: npm install / yarn install

# 2. Database
docker compose up -d                # local Postgres on :5432
cp .env.example .env.local           # fill in keys (or leave empty for mocks)

# 3. Schema + seed
pnpm db:push     # creates tables
pnpm seed        # populates the asset universe

# 4. Run
pnpm dev         # web app on :3000
pnpm worker      # in a second terminal: refresh snapshots, run AI, evaluate alerts
```

Open <http://localhost:3000> → you should land on the dashboard.

## Environment variables

Required:
- `DATABASE_URL` — Postgres connection string
- `GROQ_API_KEY` — free at https://console.groq.com (skip for stub mode)

Recommended:
- `PYTH_API_KEY` — your Pyth Pro key (falls back to public Hermes without)
- `CRYPTOPANIC_API_KEY` — news feed (falls back to mock news)
- `FRED_API_KEY` — US macro (falls back to recent constants)

See `.env.example` for the full list and the architecture doc for what each unlocks.

**Security:** every key is read in `lib/env.ts` and never crosses to the client. The architecture doc spells out the build-time grep guard.

## Day in the life

1. Open `/dashboard` — see regime, risk score, AI narrative, top movers per asset class.
2. Click any mover → asset detail page with chart, indicators, levels, news.
3. Click **Regenerate AI thesis** to produce a fresh indication card.
4. Visit `/analyst` for the cross-asset card stream.
5. Visit `/alerts` and create a `PRICE_CROSS` or `PCT_MOVE` rule — the worker will fire it.
6. `/admin` shows provider health.

## How the AI behaves

The LLM never invents prices. Levels are computed from OHLC in `lib/analysis/levels.ts`. The LLM only narrates over a structured feature bag and is constrained by:
- A zod schema for the output card
- A banned-phrase list (no "moon", "guaranteed", leverage suggestions, etc.)
- A "stale price → bias must be WATCH" gate
- A confidence downgrade if fewer than 3 independent inputs agree

Full spec in `docs/06-ai-pipeline.md`.

## Without API keys

Everything still runs:
- Pyth → mocked deterministic prices (labeled `mock` in UI)
- CoinGecko → mock candles
- Cryptopanic → 4 placeholder headlines
- FRED → recent macro constants
- Groq → analyst returns a "AI offline" placeholder card

Set keys in `.env.local` to switch each provider to live.

## Production deploy

See `docs/08-deployment.md`. TL;DR: Vercel for web, Neon for Postgres, Fly.io for worker. All have free tiers that fit v1.

## What's intentionally not in v1

- Order routing / brokerage integration
- Portfolio P&L tracking
- Social / copy-trading
- Multi-user auth (single-user mode via `DTS_USER_EMAIL`; toggle `AUTH_ENABLED=1` to wire NextAuth later)
- Mobile native app

## Disclaimer

DTS produces market analyses with explicit confidence, levels, and invalidation. It is not a guaranteed trading system, not financial advice, and has no portfolio integration. Use it as one input alongside your own research.

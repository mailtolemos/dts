# DTS — Deployment Plan

## Environments

- **Local dev** — `pnpm dev` (Next.js), `pnpm worker` (long-running node), Postgres via docker compose.
- **Preview** — Vercel preview deploys per PR; Neon branch DB per PR (optional).
- **Production** — Vercel (web), Neon (Postgres), Fly.io 256MB shared-cpu (worker), Upstash Redis (optional).

## Hosts & costs (free-tier targets)

| Component | Host | Free tier | Cost at v1 scale |
|---|---|---|---|
| Web | Vercel Hobby | 100 GB bandwidth/mo | $0 |
| DB | Neon Free | 0.5 GB, 100 hours compute | $0 |
| Worker | Fly.io | 3 × 256 MB | $0 |
| LLM | Groq | generous free RPM | $0 |
| Pyth | Hermes public | rate-limited | $0 (Pyth Pro key extends limits) |
| News | Cryptopanic free | 100 req/day | $0 |
| Macro | FRED | unlimited (be polite) | $0 |
| Redis | Upstash | 10k cmds/day | $0 |
| Email | Resend | 100/day | $0 |

## CI/CD

GitHub Actions:
1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test`
5. `pnpm build`
6. Grep guard: fail if `process.env.*_KEY` appears in `.next/static/**` after build.
7. On `main`: Vercel deploy hook + `flyctl deploy ./worker`.

Migrations: `prisma migrate deploy` in Vercel build step, gated on `DATABASE_URL` presence.

## Env vars (production)

Required (boot fails without):
- `DATABASE_URL`
- `GROQ_API_KEY`

Recommended:
- `PYTH_API_KEY` (Pyth Pro; without it, Hermes public is used)
- `CRYPTOPANIC_API_KEY`
- `FRED_API_KEY`

Optional:
- `POLYGON_API_KEY`, `RESEND_API_KEY`, `REDIS_URL`, `SENTRY_DSN`
- `AUTH_ENABLED` (default `0` → single-user mode), `DTS_USER_EMAIL`

## Observability

- **Logs:** Pino JSON → Vercel logs + Fly.io logs. Tail with `vercel logs --follow` / `flyctl logs`.
- **Metrics (lightweight):** counters in process; surfaced at `/api/admin/health`. Send to OpenTelemetry collector later.
- **Errors:** Optional Sentry SDK in both web and worker.

## Backup / DR

- Neon auto snapshots (daily, 7-day retention on free tier).
- Worker is stateless; restart-safe.
- Prisma migration history is the single source of truth for schema.

## Rollout sequence (first deploy)

1. Create Neon project; copy `DATABASE_URL`.
2. Set Vercel env vars; deploy preview.
3. `npx prisma migrate deploy && npx tsx scripts/seed.ts` against Neon.
4. Smoke-test `/api/dashboard` and `/api/feeds?class=CRYPTO`.
5. Deploy worker to Fly.io with same env.
6. Verify `worker.lastRunAt` updates within 5 min.
7. Promote preview → production.

## Security

- HTTPS everywhere (Vercel + Fly defaults).
- CSP locked in `next.config.js`: default-src 'self', connect-src includes Pyth Hermes domain and Groq endpoint.
- No client-side env access except `NEXT_PUBLIC_*` (intentionally empty).
- Webhook alert delivery (v1.1) signs payloads with HMAC-SHA256.
- Rate limit on `/api/*` (IP token bucket).

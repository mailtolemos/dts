# Deploying DTS to GitHub + Vercel

Quick guide. ~5 minutes total.

## 0. Open Terminal on your Mac and `cd` into the project

```bash
cd "$HOME/Library/Application Support/Claude/local-agent-mode-sessions/1261d618-302d-4112-9fdd-c17940717865/3c982786-3368-4af0-82fe-c2aac82b7640/local_50924825-424e-434b-9694-ad05857d6491/outputs/dts"
```

(That path is where the project lives on your machine. Or copy/move the `dts/` folder to a more convenient spot like `~/code/dts` first — recommended.)

```bash
# Optional but tidier:
mkdir -p "$HOME/code" && cp -R . "$HOME/code/dts" && cd "$HOME/code/dts"
```

## 1. Clean up the half-initialized .git, then init fresh

A `.git/` folder may exist from the sandbox; it's incomplete. Remove and re-init:

```bash
rm -rf .git
git init -b main
git add .
git status   # sanity check: node_modules/, .env*, .next/ should NOT be listed
git commit -m "feat: DTS v0.1 — spec + scaffold"
```

## 2. Push to GitHub

### Option A — `gh` CLI (one command if you have GitHub CLI)

```bash
# Install if needed:
brew install gh && gh auth login

# Create the repo and push in one shot:
gh repo create dts --private --source=. --remote=origin --push
```

### Option B — Web UI

1. Go to <https://github.com/new>, create a repo named `dts` (private is fine), **do not** check any of the "initialize with…" boxes.
2. Copy the SSH or HTTPS URL it shows, then:

```bash
git remote add origin git@github.com:<your-username>/dts.git
git push -u origin main
```

## 3. Connect to Vercel

1. Go to <https://vercel.com/new>.
2. **Import** your new `dts` repo.
3. Framework auto-detects as **Next.js**. Leave the build/install commands as the defaults (a `vercel.json` is already in the repo with the correct values).
4. Add **Environment Variables** (only `DATABASE_URL` is strictly required for the app not to crash on first request):

   | Key                    | Where to get it                                   | Notes                                                                                  |
   | ---------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
   | `DATABASE_URL`         | <https://neon.tech> or <https://supabase.com>     | Create a free Postgres project, copy the pooled connection string.                     |
   | `GROQ_API_KEY`         | <https://console.groq.com>                        | Free. Without it, the analyst returns a placeholder card (still useful for testing).   |
   | `PYTH_API_KEY`         | Pyth Pro                                          | Optional — public Hermes works without it (rate-limited).                              |
   | `CRYPTOPANIC_API_KEY`  | <https://cryptopanic.com/developers/api/>         | Optional — falls back to 4 mock headlines.                                             |
   | `FRED_API_KEY`         | <https://fredaccount.stlouisfed.org>              | Optional — falls back to recent macro constants.                                       |
   | `DTS_USER_EMAIL`       | your email                                        | Used in v1 single-user mode.                                                            |
   | `NODE_ENV`             | `production`                                      |                                                                                        |

5. **Deploy.** First build takes ~90 seconds.

## 4. Run database migrations against the live DB

Vercel will not auto-run migrations. From your Mac:

```bash
# Set the same DATABASE_URL you put in Vercel:
export DATABASE_URL='postgresql://...'
npx prisma migrate deploy            # or: npx prisma db push  (for v1, equivalent)
npx tsx scripts/seed.ts              # populates the asset universe + default user
```

After this completes, refresh your Vercel URL. The dashboard should load.

## 5. (Optional) Run the worker

The background worker (`scripts/worker.ts`) doesn't run on Vercel — Vercel functions are short-lived. Two options:

- **For now (testing):** run it locally on your Mac. As long as `DATABASE_URL` points at the production DB, snapshots, AI cards, and alerts will be written. `npm run worker`
- **Production:** deploy it to **Fly.io** (free tier covers it) or any small VM. See `docs/08-deployment.md` for the recipe.

## Common gotchas

- **Build fails with "Cannot find module '@prisma/client'"** — `prisma generate` runs in our `build` script. If you tweaked `package.json`, make sure it's still there.
- **"Invalid environment: DATABASE_URL: Required"** — env var not set in Vercel; add it under Settings → Environment Variables and redeploy.
- **Pages all show "AI offline" placeholders** — `GROQ_API_KEY` not set or invalid. The app is designed to degrade to mocks; set the key when you want real cards.
- **Prices look static / labeled "mock"** — Pyth Hermes is public but rate-limited. Set `PYTH_API_KEY` for higher limits, or just wait — the cache refreshes every second.

That's it. Your URL on the free Hobby plan looks like `https://dts-<hash>-<username>.vercel.app`.

# Deploying BIL

BIL runs on three services:

| Piece | Where | How it deploys |
|---|---|---|
| Website (Vue) | Netlify | Netlify builds every push to `main` from `netlify.toml` |
| Database, Auth, Storage, cron | Supabase project `lluwzpwiybvgnsimpwey` | GitHub Actions `deploy` job runs `supabase db push` |
| Discord bot (Edge Functions) | Supabase Edge Functions | GitHub Actions `deploy` job runs `supabase functions deploy` |

The bot is serverless: Discord calls `discord-interactions`, and pg_cron calls `discord-scheduler` every 5 minutes. There is no always-on process to host.

## 1. Every setting and secret

Nothing secret ever goes in a `VITE_` variable: those are compiled into the public website.

### Netlify (Site configuration → Environment variables)

| Name | Value | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://lluwzpwiybvgnsimpwey.supabase.co` | Public |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable key | Public by design; RLS protects the data |
| `VITE_DISCORD_INVITE_URL` | `https://discord.gg/WWavSTQXWR` | Set the invite to never expire in Discord |
| `VITE_SITE_URL` | Your Netlify URL, e.g. `https://hal-league.netlify.app` (later your domain) | No trailing slash. Used for share previews |

Node 22 and pnpm (from `package.json` `packageManager`) are picked automatically.

### Supabase Edge Function secrets (Dashboard → Edge Functions → Secrets, or `supabase secrets set`)

| Name | Value | Status |
|---|---|---|
| `DISCORD_APP_ID` | Discord Developer Portal → BIL → Application ID | Set |
| `DISCORD_PUBLIC_KEY` | Developer Portal → General Information → Public Key | Set |
| `DISCORD_BOT_TOKEN` | Developer Portal → Bot → Token | Set |
| `DISCORD_GUILD_ID` | Your server ID (Developer Mode → right-click server → Copy Server ID) | Set |
| `SITE_URL` | Same as `VITE_SITE_URL` | **Set to your local address today. Change it to the Netlify URL after the first deploy**, or Discord links point at localhost |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Provided by Supabase automatically | Set |

### Supabase Vault (Database → Vault)

| Name | Value | Status |
|---|---|---|
| `discord_sync_url` | `https://lluwzpwiybvgnsimpwey.supabase.co/functions/v1/discord-sync` | Set (the scheduler URL is derived from it) |
| `discord_sync_secret` | Random secret shared by the database and the functions | Set (generated in the database; never put it in a migration) |

### GitHub (repo → Settings → Secrets and variables → Actions → Secrets tab → **Repository secrets**)

These let GitHub Actions lint the database, apply migrations and deploy the Edge Functions on every push to `main`. Use repository secrets, not environment secrets (the workflow names no environment, so it can't read those), and nothing goes in the Variables tab. Without them CI still typechecks, lints, tests and builds, and skips the database steps. Netlify can't take this job: it only builds the website.

| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Open https://supabase.com/dashboard/account/tokens (signed in) → **Generate new token**. Copy it at once; it is shown only once. If asked for an expiry, pick none or note the date: CI deploys fail once it expires |
| `SUPABASE_PROJECT_REF` | `lluwzpwiybvgnsimpwey` |
| `SUPABASE_DB_PASSWORD` | Database password (Project Settings → Database; reset it there if you don't have it) |

### Your computer (`.env` in the repo root and `apps/web/.env.local`; never committed)

`.env`: `SUPABASE_PROJECT_REF`, `SUPABASE_SERVICE_ROLE_KEY`, `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` (used by `pnpm commands:register`). `apps/web/.env.local`: the `VITE_` values above. See `.env.example` and `apps/web/.env.example`.

### In the app (Admin → Discord → Channels, owner only)

Channel IDs for the ten bot channels (see `docs/discord-server-text.md`, step 7).

## 2. First deploy, in order

1. **GitHub secrets**, then **push** `main`. The `deploy` job should pass and change nothing the first time (every migration is already applied).
2. **Netlify:** Add new site → Import from Git → pick the BIL repository. Netlify reads `netlify.toml` (base `/`, build `pnpm --filter web build`, publish `apps/web/dist`). Add the `VITE_` variables, then deploy. Note the site URL.
3. **Point everything at the live URL:**
   - Netlify: set `VITE_SITE_URL` to the site URL and redeploy.
   - Supabase Edge Function secret `SITE_URL`: the same URL.
   - Supabase → Authentication → URL Configuration: **Site URL** = the site URL; **Redirect URLs** add `https://<your-site>/auth/callback` (keep `http://localhost:5174/auth/callback` for local development).
4. **Discord Developer Portal → BIL:**
   - General Information → **Interactions Endpoint URL**: `https://lluwzpwiybvgnsimpwey.supabase.co/functions/v1/discord-interactions` (Discord sends a test request; it must save without errors).
   - OAuth2 → Redirects: `https://lluwzpwiybvgnsimpwey.supabase.co/auth/v1/callback` (Supabase's Discord login callback; already set if login works locally).
5. **Slash commands:** `pnpm commands:register` (from the repo root, with `.env` filled in). It should print `/ping, /link, /help, /lfg, /reschedule, /report, /dispute`.
6. **Owner:** log in on the live site with Discord, then run `supabase/snippets/make_owner.sql` in the SQL editor for your account (already done for the current project).
7. **Channels:** Admin → Discord → Channels: paste the channel IDs (ten league channels plus the three 8s ones). Then press **Resync Discord** once. The full server setup, in order, is in `docs/discord-server-text.md`.
8. **Check:** Admin → Health shows no errors and every scheduled job as `succeeded` after a few minutes. In Discord, `/ping` answers "Blackhat bot online."

## 3. Every later deploy

Push to `main`. Netlify rebuilds the site; GitHub Actions runs the checks, applies any new migrations (`supabase db push`) and redeploys the three functions. Pull requests run the same checks without deploying.

- `db push` compares `supabase/migrations` with the remote history, so each local file's version prefix must equal its remote version (migrations applied early with MCP `apply_migration` are then skipped, not re-run). A mismatch fails the `deploy` job.
- Netlify and GitHub Actions run in parallel, so for website code that needs a new migration or function, apply/deploy it first (MCP or the command below) and push afterwards.
- Manual function deploy, if ever needed (from the repo root):

```
npx supabase functions deploy discord-interactions discord-scheduler discord-sync --no-verify-jwt --project-ref lluwzpwiybvgnsimpwey --use-api
```

New slash commands or changed command options need `pnpm commands:register` again.

## 4. Security headers

`netlify.toml` sends a strict Content Security Policy. It allows only Supabase (API, Storage, Realtime), GitHub (the rulebook), the Discord avatar CDN and Google Fonts. **If you add a feature that loads anything from another host (an image, an API, an embed), add that host to the CSP first**, or the browser blocks it in production. Stream links open in a new tab, so they need no CSP entry.

## 5. Monitoring

- **Admin → Health:** site errors reported by visitors' browsers (last 30 days), bot errors, Discord posts waiting or retrying, and the status of each scheduled job.
- **Supabase → Edge Functions → Logs** for function details; **Database → Cron Jobs** for job history.
- After a deploy, an open browser tab that can't load new page code reloads itself once.

# Heaven's Arena League (HAL)

Website and Discord bot for Heaven's Arena League, a competitive Call of Duty league.
Join the Discord: https://discord.gg/G3WjuvFak8

## Run locally
```
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then fill in VITE_SUPABASE_PUBLISHABLE_KEY
pnpm dev
```

Project spec and conventions: [CLAUDE.md](CLAUDE.md). Rulebook: [rules/rulebook.md](rules/rulebook.md).

## Discord bot

The bot is serverless: Discord sends every slash command, button and modal to the
`discord-interactions` Supabase Edge Function, which checks Discord's signature and replies.
There is no bot process to keep running.

### 1. Discord setup (once)
1. In the [Discord Developer Portal](https://discord.com/developers/applications), open the HAL
   application. Copy the **Application ID** and **Public Key** (General Information) and the
   **bot token** (Bot → Reset Token).
2. In Discord, turn on Developer Mode (User Settings → Advanced), right-click the HAL server and
   **Copy Server ID**.
3. Invite the bot: OAuth2 → URL Generator, scopes `bot` and `applications.commands`, permissions
   Manage Roles, Manage Channels, Send Messages, Create Private Threads, Manage Threads, Embed
   Links, Attach Files, Read Message History. Open the generated URL and add it to the HAL server.
4. Server Settings → Roles: drag the bot's role **above** every role it will assign.

### 2. Function secrets
In the Supabase dashboard (Edge Functions → Secrets), or with the CLI:
```
supabase secrets set --project-ref lluwzpwiybvgnsimpwey \
  DISCORD_PUBLIC_KEY=... DISCORD_BOT_TOKEN=... DISCORD_APP_ID=... DISCORD_GUILD_ID=... \
  SITE_URL=http://localhost:5174
```
Change `SITE_URL` to the Netlify URL when the site goes live.

### 3. Interactions Endpoint URL
In the Developer Portal → General Information → **Interactions Endpoint URL**, paste
```
https://lluwzpwiybvgnsimpwey.supabase.co/functions/v1/discord-interactions
```
and save. Discord sends a signed test request and a deliberately bad one; it only saves the URL if
the function accepts the first and rejects the second, so a successful save proves the signature
check works. The function is deployed with `--no-verify-jwt` because Discord can't send a Supabase
JWT; the signature check is the authentication.

### 4. Register slash commands
Fill in `DISCORD_APP_ID`, `DISCORD_GUILD_ID` and `DISCORD_BOT_TOKEN` in the root `.env`
(copy `.env.example`), then:
```
pnpm commands:register
```
Run it again whenever `supabase/functions/_shared/commands.ts` changes. `/ping` should answer
"HAL bot online."

### Tests
```
pnpm test:functions   # Deno tests for the signature check and router
```

/**
 * Registers BIL's slash commands in the BIL Discord server (guild commands update instantly).
 * Run from the repo root after filling in .env:
 *   pnpm commands:register
 * Command definitions live in supabase/functions/_shared/commands.ts (shared with the bot).
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { COMMANDS } from '../supabase/functions/_shared/commands.ts'

// Load the repo-root .env, wherever the script is run from.
const envPath = fileURLToPath(new URL('../.env', import.meta.url))
if (existsSync(envPath)) process.loadEnvFile(envPath)

const appId = process.env.DISCORD_APP_ID
const guildId = process.env.DISCORD_GUILD_ID
const token = process.env.DISCORD_BOT_TOKEN

if (!appId || !guildId || !token) {
  console.error('Set DISCORD_APP_ID, DISCORD_GUILD_ID and DISCORD_BOT_TOKEN in .env (see .env.example).')
  process.exit(1)
}

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`, {
  method: 'PUT', // replaces the full set, so removed commands disappear too
  headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(COMMANDS),
})

if (!res.ok) {
  console.error(`Discord returned ${res.status}:`, await res.text())
  process.exit(1)
}

const registered = (await res.json()) as { name: string }[]
console.log(`Registered ${registered.length} commands: ${registered.map((c) => `/${c.name}`).join(', ')}`)

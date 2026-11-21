/**
 * discord-sync: makes Discord roles and team channels match the database.
 *
 * Callers:
 *  - Postgres triggers via pg_net (header x-hal-sync-secret = Vault discord_sync_secret)
 *    actions: team_sync, team_removed, user_sync (team_approved/team_renamed/member_joined/
 *    member_left/staff_role_changed/free_agent_changed are accepted as aliases).
 *  - The owner's buttons on Admin → Discord (Supabase user JWT; owner only): full_resync, and
 *    post_guides (posts or refreshes the pinned channel guides).
 *
 * Deployed with verify_jwt off because pg_net can't send a JWT; both paths authenticate here.
 * Secrets: DISCORD_BOT_TOKEN, DISCORD_APP_ID (= the bot's user id), DISCORD_GUILD_ID.
 */
import { adminClient } from '../_shared/supabase.ts'
import { postAllGuides } from './guides.ts'
import { emptyStats, ensureSettings, fullResync, logError, removeTeamDiscord, syncTeam, syncUser, type SyncEnv } from './sync.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const ALIASES: Record<string, string> = {
  team_approved: 'team_sync',
  team_renamed: 'team_sync',
  member_joined: 'user_sync',
  member_left: 'user_sync',
  staff_role_changed: 'user_sync',
  free_agent_changed: 'user_sync',
}

/** Actions the owner can run from the site (everything else is trigger-only). */
const OWNER_ACTIONS = ['full_resync', 'post_guides']

let cachedSecret: { value: string | null; at: number } | null = null
async function syncSecret(): Promise<string | null> {
  if (cachedSecret && Date.now() - cachedSecret.at < 5 * 60_000) return cachedSecret.value
  const { data } = await adminClient().rpc('discord_sync_secret')
  cachedSecret = { value: typeof data === 'string' ? data : null, at: Date.now() }
  return cachedSecret.value
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function isOwnerRequest(req: Request): Promise<boolean> {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!jwt) return false
  const db = adminClient()
  const { data } = await db.auth.getUser(jwt)
  if (!data.user) return false
  const { data: isOwner } = await db.rpc('has_role_for', { p_user_id: data.user.id, p_role: 'owner' })
  return isOwner === true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad request' }, 400)
  }
  const action = ALIASES[String(body.action)] ?? String(body.action)

  const secret = req.headers.get('x-hal-sync-secret')
  const expected = await syncSecret()
  const internal = Boolean(secret && expected && safeEqual(secret, expected))
  if (!internal) {
    if (!OWNER_ACTIONS.includes(action) || !(await isOwnerRequest(req))) return json({ error: 'unauthorized' }, 401)
  }

  const guildId = Deno.env.get('DISCORD_GUILD_ID')
  const botUserId = Deno.env.get('DISCORD_APP_ID')
  if (!guildId || !botUserId) return json({ error: 'DISCORD_GUILD_ID / DISCORD_APP_ID not set' }, 500)
  const env: SyncEnv = { db: adminClient(), guildId, botUserId }

  // Owner-triggered full resync: run it and return the counts.
  if (action === 'full_resync') {
    try {
      const stats = await fullResync(env)
      return json({ ok: true, stats })
    } catch (err) {
      await logError(env.db, action, body, err)
      return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
    }
  }

  if (action === 'post_guides') {
    try {
      const stats = await postAllGuides(env.db)
      return json({ ok: true, stats })
    } catch (err) {
      await logError(env.db, action, body, err)
      return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
    }
  }

  // Trigger calls: acknowledge immediately, do the work in the background.
  const work = (async () => {
    const stats = emptyStats()
    try {
      switch (action) {
        case 'team_sync': {
          const settings = await ensureSettings(env)
          await syncTeam(env, String(body.team_id), settings, stats)
          break
        }
        case 'team_removed':
          await removeTeamDiscord(env, (body.role_id as string) ?? null, (body.channel_id as string) ?? null)
          break
        case 'user_sync': {
          const settings = await ensureSettings(env)
          await syncUser(env, String(body.user_id), settings, stats)
          break
        }
        case 'audit_log':
          // Posting audit entries to #audit-log is a later step.
          break
        default:
          throw new Error(`unknown action ${action}`)
      }
    } catch (err) {
      await logError(env.db, action, body, err)
    }
  })()
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work)
  else await work
  return json({ ok: true, queued: action }, 202)
})

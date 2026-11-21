/**
 * discord-scheduler: called by pg_cron every 5 minutes (header x-hal-sync-secret, the same Vault
 * secret as discord-sync). Deployed with verify_jwt off; the secret is the authentication.
 *
 * 1. Per-match posts in team channels: 24h and 1h reminders, the check-in button at T-15m, and a
 *    warning (plus #admin-only) if a team hasn't checked in at the start time.
 * 2. Drains notifications_outbox for the types it handles: results to #results, "Now live" to
 *    #announcements, reschedule notices to both team channels, check-in confirmations, and new
 *    disputes to #admin-only. Other types stay queued for later features.
 *
 * Every post is claimed in bot_events first, so overlapping runs never double-post.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminClient } from '../_shared/supabase.ts'
import { editMessage, sendMessage, type MessagePayload } from '../_shared/discord.ts'
import {
  claimEvent,
  findEvent,
  loadAdminRoleId,
  loadChannels,
  loadMatch,
  MATCH_COLUMNS,
  recordEvent,
  releaseEvent,
  toBotMatch,
  type BotMatch,
  type BotTeam,
  type ChannelSettings,
} from '../_shared/match_data.ts'
import {
  adminMissingCheckinMessage,
  checkedInMessage,
  checkinOpenMessage,
  liveMessage,
  missingCheckinMessage,
  reminderMessage,
  resultMessage,
  topPerformer,
} from '../_shared/match_messages.ts'
import { dueKinds, scanWindow, type Kind } from './plan.ts'
import { deleteLfgMessage, publishLfg } from '../_shared/lfg_sync.ts'
import { finishRescheduleRequest, postRescheduleRequest } from '../_shared/reschedule_flow.ts'
import { closeDisputeThread, ensureDisputeThread, postDisputeComment, reopenDisputeThread } from '../_shared/dispute_flow.ts'
import { handleEsubEvent } from '../_shared/esub_flow.ts'
import { runAutoAnnouncements } from '../_shared/announcement_flow.ts'
import { disputeAlert, mismatchAlert, teamPendingAlert, unreportedAlert, withAdminPing } from '../_shared/admin_alerts.ts'

const HANDLED = [
  'match_result',
  'broadcast_live',
  'reschedule_requested',
  'reschedule_accepted',
  'reschedule_declined',
  'reschedule_cancelled',
  'reschedule_expired',
  'checked_in',
  'dispute_opened',
  'dispute_comment',
  'dispute_resolved',
  'dispute_reopened',
  'lfg_changed',
  'lfg_deleted',
  'emergency_sub_requested',
  'emergency_sub_accepted',
  'emergency_sub_declined',
  'emergency_sub_reviewed',
  'team_pending',
  'mismatch_opened',
]
const MAX_ATTEMPTS = 5

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

interface Ctx {
  db: SupabaseClient
  siteUrl: string
  channels: ChannelSettings
  /** HAL Admin role id: every admin alert pings it. */
  adminRole: string | null
  stats: Record<string, number>
}

const bump = (ctx: Ctx, key: string) => (ctx.stats[key] = (ctx.stats[key] ?? 0) + 1)

/** Claim, post, record. Releases the claim if Discord refuses, so the next run retries. */
async function postOnce(ctx: Ctx, matchId: string, teamId: string | null, kind: string, channelId: string, payload: MessagePayload) {
  const id = await claimEvent(ctx.db, matchId, teamId, kind)
  if (id === null) return
  try {
    const msg = await sendMessage(channelId, payload)
    await recordEvent(ctx.db, id, channelId, msg.id)
    bump(ctx, kind)
  } catch (err) {
    await releaseEvent(ctx.db, id)
    throw err
  }
}

async function logError(ctx: Ctx, action: string, payload: unknown, err: unknown) {
  const message = err instanceof Error ? `${err.message}${'body' in err ? ` ${JSON.stringify((err as { body: unknown }).body)}` : ''}` : String(err)
  console.error(action, message)
  bump(ctx, 'errors')
  await ctx.db.from('discord_sync_errors').insert({ action: `scheduler:${action}`, payload, error: message.slice(0, 2000) })
}

// ---- 1. Per-match posts ------------------------------------------------------------------
function messageFor(kind: Kind, m: BotMatch, team: BotTeam, siteUrl: string): MessagePayload {
  switch (kind) {
    case 'reminder_24h':
      return reminderMessage(m, team.id, 24, siteUrl)
    case 'reminder_1h':
      return reminderMessage(m, team.id, 1, siteUrl)
    case 'checkin':
      return checkinOpenMessage(m, team.id, siteUrl)
    case 'checkin_missing':
      return missingCheckinMessage(m, team.id, team.captainDiscordIds, siteUrl)
  }
}

async function matchPosts(ctx: Ctx, now: number) {
  const { from, to } = scanWindow(now)
  const { data, error } = await ctx.db
    .from('matches')
    .select(MATCH_COLUMNS)
    .in('status', ['scheduled', 'checkin_open'])
    .gte('scheduled_at', from)
    .lt('scheduled_at', to)
  if (error) throw error
  const matches = (data ?? []).map(toBotMatch)
  if (!matches.length) return
  const { data: checkins } = await ctx.db.from('checkins').select('match_id, team_id').in('match_id', matches.map((m) => m.id))
  const checked = new Set((checkins ?? []).map((c) => `${c.match_id}:${c.team_id}`))

  for (const m of matches) {
    const missing: BotTeam[] = []
    for (const team of [m.home, m.away]) {
      const kinds = dueKinds(m.scheduledAt, now, checked.has(`${m.id}:${team.id}`))
      if (kinds.includes('checkin_missing')) missing.push(team)
      if (!team.channelId) continue
      for (const kind of kinds) {
        try {
          await postOnce(ctx, m.id, team.id, kind, team.channelId, messageFor(kind, m, team, ctx.siteUrl))
        } catch (err) {
          await logError(ctx, kind, { match_id: m.id, team_id: team.id }, err)
        }
      }
    }
    if (missing.length && ctx.channels.admin) {
      try {
        await postOnce(ctx, m.id, null, 'checkin_missing_admin', ctx.channels.admin, withAdminPing(adminMissingCheckinMessage(m, missing, ctx.siteUrl), ctx.adminRole))
      } catch (err) {
        await logError(ctx, 'checkin_missing_admin', { match_id: m.id }, err)
      }
    }
  }
}

/** Matches that started over 24h ago (up to a week) with no result: an admin has to act. */
async function unreportedAlerts(ctx: Ctx, now: number) {
  if (!ctx.channels.admin) return
  const { data, error } = await ctx.db
    .from('matches')
    .select(MATCH_COLUMNS)
    .in('status', ['scheduled', 'checkin_open', 'live', 'awaiting_reports'])
    .lt('scheduled_at', new Date(now - 24 * 3600_000).toISOString())
    .gte('scheduled_at', new Date(now - 7 * 24 * 3600_000).toISOString())
  if (error) throw error
  for (const m of (data ?? []).map(toBotMatch)) {
    try {
      await postOnce(ctx, m.id, null, 'unreported_admin', ctx.channels.admin, withAdminPing(unreportedAlert(m, ctx.siteUrl), ctx.adminRole))
    } catch (err) {
      await logError(ctx, 'unreported_admin', { match_id: m.id }, err)
    }
  }
}

// ---- 2. Outbox --------------------------------------------------------------------------
async function postResult(ctx: Ctx, matchId: string) {
  if (!ctx.channels.results) throw new Error('No #results channel set (Admin → Discord)')
  const m = await loadMatch(ctx.db, matchId)
  if (!m || (m.status !== 'confirmed' && m.status !== 'forfeit')) return // changed since; nothing to post
  const { data: maps } = await ctx.db
    .from('match_maps')
    .select('id, map_number, home_score, away_score, mode:game_modes(name), map:maps(name), stats:player_map_stats(user_id, team_id, kills, deaths, profile:profiles(discord_username, activision_id))')
    .eq('match_id', matchId)
    .order('map_number')
  // deno-lint-ignore no-explicit-any
  const rows = (maps ?? []) as any[]
  const tagOf = (teamId: string) => (teamId === m.home.id ? m.home.tag : m.away.tag)
  const top = topPerformer(
    rows.flatMap((x) =>
      // deno-lint-ignore no-explicit-any
      x.stats.map((s: any) => ({
        userId: s.user_id,
        name: s.profile?.discord_username ?? s.profile?.activision_id ?? 'Player',
        team: tagOf(s.team_id),
        kills: s.kills,
        deaths: s.deaths,
        mapId: x.id,
      })),
    ),
  )
  const payload = resultMessage(
    { ...m, status: m.status },
    rows.map((x) => ({ number: x.map_number, mode: x.mode?.name ?? 'Mode', map: x.map?.name ?? 'Map', homeScore: x.home_score, awayScore: x.away_score })),
    top,
    ctx.siteUrl,
  )
  // A changed result edits the original post instead of posting twice.
  const existing = await findEvent(ctx.db, matchId, null, 'result')
  if (existing?.discord_channel_id && existing.discord_message_id) {
    await editMessage(existing.discord_channel_id, existing.discord_message_id, payload)
    bump(ctx, 'result_edited')
    return
  }
  await postOnce(ctx, matchId, null, 'result', ctx.channels.results, payload)
}

async function handleOutbox(ctx: Ctx, row: { id: number; type: string; payload: Record<string, unknown> }) {
  const p = row.payload
  const matchId = String(p.match_id ?? '')
  switch (row.type) {
    case 'match_result':
      return postResult(ctx, matchId)
    case 'broadcast_live': {
      if (!ctx.channels.announcements) throw new Error('No #announcements channel set (Admin → Discord)')
      const m = await loadMatch(ctx.db, matchId)
      if (!m) return
      const { data: caster } = await ctx.db.from('profiles').select('discord_username, activision_id').eq('id', String(p.caster_id)).maybeSingle()
      const msg = await sendMessage(ctx.channels.announcements, liveMessage(m, String(p.url), caster?.discord_username ?? caster?.activision_id ?? 'a HAL caster', ctx.siteUrl))
      bump(ctx, 'live')
      return msg
    }
    case 'reschedule_requested':
      await postRescheduleRequest(ctx.db, String(p.request_id), ctx.siteUrl)
      bump(ctx, 'reschedule')
      return
    case 'reschedule_accepted':
    case 'reschedule_declined':
    case 'reschedule_cancelled':
    case 'reschedule_expired':
      await finishRescheduleRequest(ctx.db, String(p.request_id), ctx.siteUrl)
      bump(ctx, 'reschedule')
      return
    case 'checked_in': {
      // Turn the team's check-in post into "Checked in: …" (site check-ins; the button does it itself too).
      const ev = await findEvent(ctx.db, matchId, String(p.team_id), 'checkin')
      if (!ev?.discord_channel_id || !ev.discord_message_id) return
      const m = await loadMatch(ctx.db, matchId)
      const { data: ci } = await ctx.db.from('checkins').select('player_ids, checked_in_at').eq('match_id', matchId).eq('team_id', String(p.team_id)).maybeSingle()
      if (!m || !ci) return
      const { data: people } = await ctx.db.from('profiles').select('id, discord_username, activision_id').in('id', ci.player_ids)
      const names = (ci.player_ids as string[]).map((id) => {
        const x = (people ?? []).find((q) => q.id === id)
        return x?.discord_username ?? x?.activision_id ?? 'Player'
      })
      await editMessage(ev.discord_channel_id, ev.discord_message_id, checkedInMessage(m, String(p.team_id), names, ci.checked_in_at, ctx.siteUrl))
      return
    }
    case 'lfg_changed': {
      // Edited on the site: edit the post. Deactivated or joined a team: delete it.
      const where = await publishLfg(ctx.db, String(p.post_id), ctx.channels.lfg, ctx.siteUrl)
      if (!where) await deleteLfgMessage(p.channel_id as string | null, p.message_id as string | null)
      bump(ctx, 'lfg')
      return
    }
    case 'dispute_comment':
      await postDisputeComment(ctx.db, String(p.dispute_id), String(p.comment_id))
      return
    case 'dispute_resolved':
      await closeDisputeThread(ctx.db, String(p.dispute_id), ctx.siteUrl)
      return
    case 'dispute_reopened':
      await reopenDisputeThread(ctx.db, String(p.dispute_id))
      return
    case 'emergency_sub_requested':
    case 'emergency_sub_accepted':
    case 'emergency_sub_declined':
    case 'emergency_sub_reviewed':
      await handleEsubEvent(ctx.db, row.type, String(p.request_id), ctx.siteUrl)
      bump(ctx, 'esub')
      return
    case 'lfg_deleted':
      await deleteLfgMessage(p.channel_id as string | null, p.message_id as string | null)
      bump(ctx, 'lfg')
      return
    case 'dispute_opened': {
      // Private thread in #disputes (once; /dispute may already have made it), plus a ping in #admin-only.
      const threadId = ctx.channels.disputes
        ? await ensureDisputeThread(ctx.db, String(p.dispute_id), ctx.channels.disputes, ctx.siteUrl)
        : null
      bump(ctx, 'dispute')
      if (!ctx.channels.admin) return
      const m = await loadMatch(ctx.db, matchId)
      if (!m) return
      await postOnce(ctx, m.id, null, `dispute_admin:${String(p.dispute_id)}`, ctx.channels.admin,
        withAdminPing(disputeAlert(m, String(p.category), ctx.siteUrl, threadId), ctx.adminRole))
      return
    }
    case 'team_pending': {
      if (!ctx.channels.admin) return
      const { data: t } = await ctx.db
        .from('teams')
        .select('name, tag, status, captain:profiles!teams_captain_id_fkey(discord_username, activision_id), members:team_members(left_at, is_emergency)')
        .eq('id', String(p.team_id))
        .maybeSingle()
      if (!t || t.status !== 'pending') return // approved or removed since
      // deno-lint-ignore no-explicit-any
      const players = ((t as any).members ?? []).filter((x: { left_at: string | null; is_emergency: boolean }) => !x.left_at && !x.is_emergency).length
      if (players < 4) return // dropped below 4 before the alert went out
      // deno-lint-ignore no-explicit-any
      const cap = (t as any).captain
      await sendMessage(ctx.channels.admin, withAdminPing(
        teamPendingAlert({ name: t.name, tag: t.tag, captain: cap?.discord_username ?? cap?.activision_id ?? 'a player', players }, ctx.siteUrl),
        ctx.adminRole,
      ))
      bump(ctx, 'admin_alert')
      return
    }
    case 'mismatch_opened': {
      if (!ctx.channels.admin) return
      const m = await loadMatch(ctx.db, matchId)
      if (!m) return
      // One alert per match (reports can add mismatches in several batches).
      await postOnce(ctx, m.id, null, 'mismatch_admin', ctx.channels.admin,
        withAdminPing(mismatchAlert(m, Number(p.fields ?? 1), ctx.siteUrl), ctx.adminRole))
      return
    }
  }
}

async function drainOutbox(ctx: Ctx) {
  const { data, error } = await ctx.db
    .from('notifications_outbox')
    .select('id, type, payload, attempts')
    .is('sent_at', null)
    .in('type', HANDLED)
    .order('id')
    .limit(40)
  if (error) throw error
  for (const row of data ?? []) {
    try {
      await handleOutbox(ctx, row as { id: number; type: string; payload: Record<string, unknown> })
      await ctx.db.from('notifications_outbox').update({ sent_at: new Date().toISOString(), attempts: row.attempts + 1 }).eq('id', row.id)
    } catch (err) {
      const attempts = row.attempts + 1
      const message = err instanceof Error ? err.message : String(err)
      await ctx.db
        .from('notifications_outbox')
        .update({ attempts, last_error: message.slice(0, 500), sent_at: attempts >= MAX_ATTEMPTS ? new Date().toISOString() : null })
        .eq('id', row.id)
      await logError(ctx, row.type, { outbox_id: row.id }, err)
    }
  }
}

// ---- Entry -------------------------------------------------------------------------------
let cachedSecret: { value: string | null; at: number } | null = null
async function syncSecret(db: SupabaseClient): Promise<string | null> {
  if (cachedSecret && Date.now() - cachedSecret.at < 5 * 60_000) return cachedSecret.value
  const { data } = await db.rpc('discord_sync_secret')
  cachedSecret = { value: typeof data === 'string' ? data : null, at: Date.now() }
  return cachedSecret.value
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const db = adminClient()
  const given = req.headers.get('x-hal-sync-secret')
  const expected = await syncSecret(db)
  if (!given || !expected || !safeEqual(given, expected)) return json({ error: 'unauthorized' }, 401)

  const ctx: Ctx = {
    db,
    siteUrl: (Deno.env.get('SITE_URL') ?? 'http://localhost:5174').replace(/\/+$/, ''),
    channels: await loadChannels(db),
    adminRole: await loadAdminRoleId(db),
    stats: {},
  }
  try {
    await matchPosts(ctx, Date.now())
  } catch (err) {
    await logError(ctx, 'match_posts', {}, err)
  }
  try {
    const n = await runAutoAnnouncements(ctx.db, ctx.siteUrl)
    if (n) ctx.stats.announcements = n
  } catch (err) {
    await logError(ctx, 'announcements', {}, err)
  }
  try {
    await unreportedAlerts(ctx, Date.now())
  } catch (err) {
    await logError(ctx, 'unreported_admin', {}, err)
  }
  try {
    await drainOutbox(ctx)
  } catch (err) {
    await logError(ctx, 'outbox', {}, err)
  }
  return json({ ok: true, stats: ctx.stats })
})

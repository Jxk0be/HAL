/**
 * 8s I/O: loading queue and match data, posting and redrawing the match post, moving players into
 * the team voice channels, and pinging admins on a dispute. Rules live in the eights_* database
 * functions; messages in eights.ts.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { discordErrorCode, editMessage, moveMember, NOT_IN_VOICE, sendMessage } from './discord.ts'
import { disputeAlert, matchPost, queueBoard, type EightsMatch, type EightsPlayer, type LeaderboardRow, type Team } from './eights.ts'
import { reconcile } from './board_sync.ts'
import { withAdminPing } from './admin_alerts.ts'
import { loadAdminRoleId, type ChannelSettings } from './match_data.ts'

// deno-lint-ignore no-explicit-any
const toPlayer = (userId: string, p: any): EightsPlayer => ({
  userId,
  name: p?.activision_id ?? p?.discord_username ?? 'Player',
  discordId: p?.discord_id ?? null,
})

export async function loadQueue(db: SupabaseClient): Promise<EightsPlayer[]> {
  const { data, error } = await db
    .from('eights_queue')
    .select('user_id, joined_at, profile:profiles(activision_id, discord_username, discord_id)')
    .gte('joined_at', new Date(Date.now() - 2 * 3600_000).toISOString()) // stale spots are dropped on the next join
    .order('joined_at')
  if (error) throw error
  // deno-lint-ignore no-explicit-any
  return ((data ?? []) as any[]).map((r) => toPlayer(r.user_id, r.profile))
}

export async function loadEightsMatch(db: SupabaseClient, id: string): Promise<(EightsMatch & { channelId: string | null; messageId: string | null }) | null> {
  const { data, error } = await db
    .from('eights_matches')
    .select(
      'id, number, status, winner, map_name, mode_name, channel_id, message_id, vote_ends_at, resolved_by, ' +
        'players:eights_players(user_id, team, profile:profiles(activision_id, discord_username, discord_id)), ' +
        'reports:eights_reports(user_id, winner), votes:eights_votes(mode_id), cancels:eights_cancel_requests(user_id)',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  // deno-lint-ignore no-explicit-any
  const m = data as any
  // deno-lint-ignore no-explicit-any
  const players = (m.players ?? []) as any[]
  const teamOf = new Map(players.map((p) => [p.user_id as string, p.team as Team]))
  const byName = (a: EightsPlayer, b: EightsPlayer) => a.name.localeCompare(b.name)

  let vote: EightsMatch['vote']
  if (m.status === 'voting') {
    const { data: modes, error: modesError } = await db.rpc('eights_vote_modes')
    if (modesError) throw modesError
    // deno-lint-ignore no-explicit-any
    const cast = ((m.votes ?? []) as any[]).map((v) => v.mode_id as string)
    vote = {
      endsAt: m.vote_ends_at,
      // deno-lint-ignore no-explicit-any
      options: ((modes ?? []) as any[]).map((o) => ({ modeId: o.id, name: o.name, votes: cast.filter((id) => id === o.id).length })),
    }
  }

  return {
    vote,
    cancelRequests: (m.cancels ?? []).length,
    // A vote cancel leaves resolved_by empty; an admin cancel records the admin.
    cancelledByVote: m.status === 'cancelled' && !m.resolved_by,
    id: m.id,
    number: m.number,
    status: m.status,
    winner: m.winner,
    mapName: m.map_name,
    modeName: m.mode_name,
    channelId: m.channel_id,
    messageId: m.message_id,
    teamA: players.filter((p) => p.team === 'a').map((p) => toPlayer(p.user_id, p.profile)).sort(byName),
    teamB: players.filter((p) => p.team === 'b').map((p) => toPlayer(p.user_id, p.profile)).sort(byName),
    // deno-lint-ignore no-explicit-any
    reports: ((m.reports ?? []) as any[]).map((r) => ({ userId: r.user_id, team: teamOf.get(r.user_id) ?? 'a', winner: r.winner })),
  }
}

export async function loadLeaderboard(db: SupabaseClient, limit = 15): Promise<LeaderboardRow[]> {
  const { data, error } = await db.rpc('eights_leaderboard', { p_limit: limit })
  if (error) throw error
  // deno-lint-ignore no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    name: r.name,
    discordId: r.discord_id,
    wins: Number(r.wins),
    losses: Number(r.losses),
    played: Number(r.played),
    winPct: Number(r.win_pct),
  }))
}

/** The queue post as the scheduler's board sync wants it (family "eights"). */
export async function queueBoards(db: SupabaseClient, channelId: string) {
  return [{ key: 'eights:queue', channelId, payload: queueBoard(await loadQueue(db)) }]
}

/** Redraws the queue post now (after a join or leave) instead of waiting for the scheduler. */
export async function refreshQueueBoard(db: SupabaseClient, channels: ChannelSettings): Promise<void> {
  if (!channels.eights) return
  await reconcile(db, 'eights', await queueBoards(db, channels.eights))
}

/** Redraws the match post (report counts, result). */
export async function refreshMatchPost(db: SupabaseClient, matchId: string): Promise<EightsMatch | null> {
  const m = await loadEightsMatch(db, matchId)
  if (m?.channelId && m.messageId) await editMessage(m.channelId, m.messageId, matchPost(m))
  return m
}

export interface StartResult {
  match: EightsMatch
  moved: number
  notInVoice: number
}

/**
 * A full queue became a match: post it in #lf-8s (pinging the 8) and move everyone who is in voice
 * into their team's channel. People not in voice just get the ping and join themselves.
 */
export async function startMatch(db: SupabaseClient, matchId: string, channels: ChannelSettings): Promise<StartResult | null> {
  const m = await loadEightsMatch(db, matchId)
  if (!m) return null
  if (channels.eights) {
    const msg = await sendMessage(channels.eights, matchPost(m))
    await db.from('eights_matches').update({ channel_id: channels.eights, message_id: msg.id }).eq('id', m.id)
  }

  let moved = 0
  let notInVoice = 0
  const guildId = Deno.env.get('DISCORD_GUILD_ID')
  const targets: [EightsPlayer[], string | null][] = [
    [m.teamA, channels.eights_team_a],
    [m.teamB, channels.eights_team_b],
  ]
  for (const [team, voiceId] of targets) {
    if (!guildId || !voiceId) continue
    for (const p of team) {
      if (!p.discordId) continue
      try {
        await moveMember(guildId, p.discordId, voiceId, `8s match #${m.number}`)
        moved++
      } catch (err) {
        if (discordErrorCode(err) === NOT_IN_VOICE) notInVoice++
        else console.error('8s voice move failed', p.discordId, err)
      }
    }
  }
  return { match: m, moved, notInVoice }
}

/** Pings BIL Admin in #admin-only with buttons to settle the match. */
export async function alertAdmins(db: SupabaseClient, m: EightsMatch, channels: ChannelSettings): Promise<boolean> {
  if (!channels.admin) return false
  await sendMessage(channels.admin, withAdminPing(disputeAlert(m), await loadAdminRoleId(db)))
  return true
}

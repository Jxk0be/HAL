/**
 * Reschedule posts in team channels, shared by /reschedule (discord-interactions) and the
 * scheduler (requests and answers made on the site). bot_events makes each post happen once:
 *   rs:<requestId>       the request in each team channel (Accept/Decline in the opponent's), pinging that roster
 *   rs_done:<requestId>  the outcome notice in each team channel
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { editMessage, sendMessage } from './discord.ts'
import { claimEvent, findEvent, loadMatch, loadRosterDiscordIds, recordEvent, releaseEvent } from './match_data.ts'
import { rescheduleMessage, rescheduleOutcomeMessage, rescheduleRequestMessage, withMentions, type RescheduleEvent } from './match_messages.ts'

export interface RequestRow {
  id: string
  matchId: string
  teamId: string
  proposedAt: string
  status: RescheduleEvent
  responder: string | null
}

export async function loadRequest(db: SupabaseClient, requestId: string): Promise<RequestRow | null> {
  const { data } = await db
    .from('reschedule_requests')
    .select('id, match_id, requested_by_team_id, proposed_at, status, responder:profiles!reschedule_requests_responded_by_fkey(discord_username, activision_id)')
    .eq('id', requestId)
    .maybeSingle()
  if (!data) return null
  // deno-lint-ignore no-explicit-any
  const responder = (data as any).responder
  return {
    id: data.id,
    matchId: data.match_id,
    teamId: data.requested_by_team_id,
    proposedAt: data.proposed_at,
    status: (data.status === 'pending' ? 'requested' : data.status) as RescheduleEvent,
    responder: responder?.discord_username ?? responder?.activision_id ?? null,
  }
}

/** Posts the request in both team channels (Accept/Decline for the opponent). Safe to repeat. */
export async function postRescheduleRequest(db: SupabaseClient, requestId: string, siteUrl: string) {
  const r = await loadRequest(db, requestId)
  if (!r) return
  const m = await loadMatch(db, r.matchId)
  if (!m) return
  for (const team of [m.home, m.away]) {
    if (!team.channelId) continue
    const id = await claimEvent(db, m.id, team.id, `rs:${r.id}`)
    if (id === null) continue
    try {
      // Ping the whole roster in its own channel: the opponent has to answer, the requester's team should know.
      const roster = await loadRosterDiscordIds(db, team.id)
      const msg = await sendMessage(team.channelId, withMentions(rescheduleRequestMessage(m, r, team.id, siteUrl), roster))
      await recordEvent(db, id, team.channelId, msg.id)
    } catch (err) {
      await releaseEvent(db, id)
      throw err
    }
  }
}

/**
 * After an answer, cancel or expiry: turns both request posts into the outcome (removing the
 * buttons) and posts the result once in each team channel.
 */
export async function finishRescheduleRequest(db: SupabaseClient, requestId: string, siteUrl: string) {
  const r = await loadRequest(db, requestId)
  if (!r || r.status === 'requested') return
  const m = await loadMatch(db, r.matchId)
  if (!m) return
  const outcome = rescheduleOutcomeMessage(m, r, r.responder, siteUrl)
  for (const team of [m.home, m.away]) {
    const ev = await findEvent(db, m.id, team.id, `rs:${r.id}`)
    if (ev?.discord_channel_id && ev.discord_message_id) {
      await editMessage(ev.discord_channel_id, ev.discord_message_id, outcome).catch((err) => console.error('edit reschedule post failed', err))
    }
    if (!team.channelId) continue
    const id = await claimEvent(db, m.id, team.id, `rs_done:${r.id}`)
    if (id === null) continue
    try {
      const roster = await loadRosterDiscordIds(db, team.id)
      const msg = await sendMessage(team.channelId, withMentions(rescheduleMessage(m, r.status, r.teamId, r.proposedAt, siteUrl), roster))
      await recordEvent(db, id, team.channelId, msg.id)
    } catch (err) {
      await releaseEvent(db, id)
      throw err
    }
  }
}

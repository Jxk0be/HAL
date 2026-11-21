/**
 * Emergency sub notifications, shared by the scheduler (outbox) and the DM buttons.
 * bot_events (keyed on the match and the requesting team) makes each post happen once:
 *   esub:<id>       the DM to the player (its message id is kept so answers can edit it)
 *   esub_new:<id>   the #admin-only heads-up when the captain asks
 *   esub_admin:<id> the #admin-only post once the player accepted (pings HAL Admin)
 *   esub_done:<id>  the outcome in the team's channel (declined / approved / denied)
 *   esub_dm2:<id>   the decision DM to the player
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { CANNOT_DM, createDmChannel, discordErrorCode, editMessage, sendMessage, type MessagePayload } from './discord.ts'
import { claimEvent, findEvent, loadAdminRoleId, loadChannels, loadMatch, recordEvent, releaseEvent } from './match_data.ts'
import {
  esubAdminMessage,
  esubAnsweredDm,
  esubDecisionDm,
  esubInviteDm,
  esubTeamMessage,
  type EsubRequest,
} from './esub_messages.ts'

export interface EsubRow extends EsubRequest {
  status: 'pending' | 'approved' | 'denied'
  accepted: boolean
  declined: boolean
  playerDiscordId: string | null
  teamChannelId: string | null
}

const nameOf = (p: { activision_id?: string | null; discord_username?: string | null } | null) =>
  p?.activision_id ?? p?.discord_username ?? 'A free agent'

export async function loadEsub(db: SupabaseClient, requestId: string): Promise<EsubRow | null> {
  const { data } = await db
    .from('roster_requests')
    .select(
      'id, type, status, note, team_id, match_id, player_confirmed_at, player_declined_at, ' +
        'player:profiles!roster_requests_user_id_fkey(discord_id, discord_username, activision_id), ' +
        'captain:profiles!roster_requests_requested_by_fkey(discord_username, activision_id)',
    )
    .eq('id', requestId)
    .maybeSingle()
  // deno-lint-ignore no-explicit-any
  const r = data as any
  if (!r || r.type !== 'emergency_sub' || !r.match_id) return null
  const m = await loadMatch(db, r.match_id)
  if (!m) return null
  const team = m.home.id === r.team_id ? m.home : m.away
  return {
    id: r.id,
    team: { id: team.id, name: team.name, tag: team.tag },
    match: { id: m.id, week: m.week, scheduledAt: m.scheduledAt, home: m.home, away: m.away },
    player: nameOf(r.player),
    captain: r.captain?.discord_username ?? r.captain?.activision_id ?? 'The captain',
    note: r.note,
    out: await loadOut(db, r.match_id, r.team_id),
    status: r.status,
    accepted: Boolean(r.player_confirmed_at),
    declined: Boolean(r.player_declined_at),
    playerDiscordId: r.player?.discord_id ?? null,
    teamChannelId: team.channelId,
  }
}

async function loadOut(db: SupabaseClient, matchId: string, teamId: string) {
  const { data } = await db
    .from('match_absences')
    .select('reason, player:profiles!match_absences_user_id_fkey(activision_id, discord_username)')
    .eq('match_id', matchId)
    .eq('team_id', teamId)
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((a: any) => ({ name: nameOf(a.player), reason: a.reason as string | null }))
}

/** Posts once per kind; a failed post releases the claim so the next run retries. */
async function postOnce(db: SupabaseClient, r: EsubRow, kind: string, send: () => Promise<{ channelId: string; messageId: string } | null>) {
  const id = await claimEvent(db, r.match.id, r.team.id, `${kind}:${r.id}`)
  if (id === null) return
  try {
    const where = await send()
    if (where) await recordEvent(db, id, where.channelId, where.messageId)
  } catch (err) {
    await releaseEvent(db, id)
    throw err
  }
}

/** DMs a player. Returns null if they don't accept DMs from server members (they can still use the site). */
async function dm(discordId: string, payload: MessagePayload) {
  try {
    const channel = await createDmChannel(discordId)
    const msg = await sendMessage(channel.id, payload)
    return { channelId: channel.id, messageId: msg.id }
  } catch (err) {
    if (discordErrorCode(err) === CANNOT_DM) return null
    throw err
  }
}

/** Edits the original DM (buttons off) once the player has answered, wherever they answered. */
async function closeInviteDm(db: SupabaseClient, r: EsubRow, siteUrl: string) {
  const ev = await findEvent(db, r.match.id, r.team.id, `esub:${r.id}`)
  if (!ev?.discord_channel_id || !ev.discord_message_id) return
  await editMessage(ev.discord_channel_id, ev.discord_message_id, esubAnsweredDm(r, r.accepted, siteUrl)).catch((err) =>
    console.error('esub dm edit failed', err),
  )
}

export async function handleEsubEvent(
  db: SupabaseClient,
  type: 'emergency_sub_requested' | 'emergency_sub_accepted' | 'emergency_sub_declined' | 'emergency_sub_reviewed',
  requestId: string,
  siteUrl: string,
) {
  const r = await loadEsub(db, requestId)
  if (!r) return

  if (type === 'emergency_sub_requested') {
    if (r.status !== 'pending' || r.declined) return
    const admin = (await loadChannels(db)).admin
    if (admin) {
      await postOnce(db, r, 'esub_new', async () => {
        const msg = await sendMessage(admin, esubAdminMessage(r, siteUrl, 'requested'))
        return { channelId: admin, messageId: msg.id }
      })
    }
    if (!r.playerDiscordId || r.accepted) return
    const discordId = r.playerDiscordId
    await postOnce(db, r, 'esub', () => dm(discordId, esubInviteDm(r, siteUrl)))
    return
  }

  if (type === 'emergency_sub_accepted') {
    await closeInviteDm(db, r, siteUrl)
    const admin = (await loadChannels(db)).admin
    if (!admin) return
    // Ready to approve: always ping HAL Admin.
    const role = await loadAdminRoleId(db)
    await postOnce(db, r, 'esub_admin', async () => {
      const msg = await sendMessage(admin, esubAdminMessage(r, siteUrl, 'accepted', role))
      return { channelId: admin, messageId: msg.id }
    })
    return
  }

  const channel = r.teamChannelId
  if (type === 'emergency_sub_declined') {
    await closeInviteDm(db, r, siteUrl)
    if (channel) {
      await postOnce(db, r, 'esub_done', async () => {
        const msg = await sendMessage(channel, esubTeamMessage(r, 'declined', siteUrl))
        return { channelId: channel, messageId: msg.id }
      })
    }
    return
  }

  // Reviewed by an admin.
  if (r.status === 'pending') return
  const approved = r.status === 'approved'
  if (channel) {
    await postOnce(db, r, 'esub_done', async () => {
      const msg = await sendMessage(channel, esubTeamMessage(r, approved ? 'approved' : 'denied', siteUrl))
      return { channelId: channel, messageId: msg.id }
    })
  }
  if (r.playerDiscordId) {
    const discordId = r.playerDiscordId
    await postOnce(db, r, 'esub_dm2', () => dm(discordId, esubDecisionDm(r, approved)))
  }
}

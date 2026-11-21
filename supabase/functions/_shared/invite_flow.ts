/**
 * Team invite notifications, shared by the scheduler (outbox) and the DM buttons.
 * The DM's channel and message ids are kept in bot_events (kind "invite:<id>", no match), so the
 * invite row isn't touched and the audit log stays clean. "invite_done:<id>" marks the team notice.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { CANNOT_DM, createDmChannel, discordErrorCode, editMessage, sendMessage } from './discord.ts'
import { inviteClosedDm, inviteDm, inviteTeamNotice, type InviteInfo, type InviteStatus } from './invite_messages.ts'

export interface InviteRow extends InviteInfo {
  status: InviteStatus
  playerDiscordId: string | null
  teamChannelId: string | null
}

const nameOf = (p: { activision_id?: string | null; discord_username?: string | null } | null, fallback: string) =>
  p?.activision_id ?? p?.discord_username ?? fallback

export async function loadInvite(db: SupabaseClient, inviteId: string): Promise<InviteRow | null> {
  const { data } = await db
    .from('team_invites')
    .select(
      'id, role, status, expires_at, team:teams(id, name, tag, discord_channel_id), ' +
        'player:profiles!team_invites_user_id_fkey(discord_id, discord_username, activision_id), ' +
        'captain:profiles!team_invites_invited_by_fkey(discord_username, activision_id)',
    )
    .eq('id', inviteId)
    .maybeSingle()
  // deno-lint-ignore no-explicit-any
  const r = data as any
  if (!r?.team) return null
  return {
    id: r.id,
    team: { id: r.team.id, name: r.team.name, tag: r.team.tag },
    captain: r.captain?.discord_username ?? r.captain?.activision_id ?? 'The captain',
    player: nameOf(r.player, 'A player'),
    role: r.role,
    expiresAt: r.expires_at,
    status: r.status,
    playerDiscordId: r.player?.discord_id ?? null,
    teamChannelId: r.team.discord_channel_id ?? null,
  }
}

async function findDm(db: SupabaseClient, inviteId: string) {
  const { data } = await db
    .from('bot_events')
    .select('id, discord_channel_id, discord_message_id')
    .is('match_id', null)
    .eq('kind', `invite:${inviteId}`)
    .maybeSingle()
  return data as { id: number; discord_channel_id: string | null; discord_message_id: string | null } | null
}

/** DM the player once. Returns false when they don't accept DMs from server members. */
async function sendInviteDm(db: SupabaseClient, inv: InviteRow, siteUrl: string): Promise<boolean> {
  if (!inv.playerDiscordId || inv.status !== 'pending') return false
  if (await findDm(db, inv.id)) return true
  try {
    const channel = await createDmChannel(inv.playerDiscordId)
    const msg = await sendMessage(channel.id, inviteDm(inv, siteUrl))
    await db.from('bot_events').insert({ kind: `invite:${inv.id}`, discord_channel_id: channel.id, discord_message_id: msg.id })
    return true
  } catch (err) {
    if (discordErrorCode(err) === CANNOT_DM) return false
    throw err
  }
}

export async function handleInviteEvent(db: SupabaseClient, type: 'team_invite_sent' | 'team_invite_closed', inviteId: string, siteUrl: string) {
  const inv = await loadInvite(db, inviteId)
  if (!inv) return
  if (type === 'team_invite_sent') {
    await sendInviteDm(db, inv, siteUrl)
    return
  }
  // Closed: turn the DM's buttons off, and tell the team when the player answered.
  const dm = await findDm(db, inv.id)
  if (dm?.discord_channel_id && dm.discord_message_id) {
    await editMessage(dm.discord_channel_id, dm.discord_message_id, inviteClosedDm(inv, inv.status, siteUrl)).catch((err) =>
      console.error('invite dm edit failed', err),
    )
  }
  if ((inv.status === 'accepted' || inv.status === 'declined') && inv.teamChannelId) {
    const { data: done } = await db.from('bot_events').select('id').is('match_id', null).eq('kind', `invite_done:${inv.id}`).maybeSingle()
    if (done) return
    const msg = await sendMessage(inv.teamChannelId, inviteTeamNotice(inv, inv.status === 'accepted', siteUrl))
    await db.from('bot_events').insert({ kind: `invite_done:${inv.id}`, team_id: inv.team.id, discord_channel_id: inv.teamChannelId, discord_message_id: msg.id })
  }
}

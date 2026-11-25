/**
 * Preseason Discord I/O, shared by the scheduler (outbox events) and the bot's buttons and
 * /preseason command. Every function is safe to repeat: posts are tracked by the Discord ids
 * stored on preseason_interest / preseason_pairings / preseason_proposals.
 *
 * Outbox events (queued by the preseason_* database functions):
 *   preseason_invite            {team_id}       post or redraw the invite in the team channel
 *   preseason_pairing           {pairing_id}    create the shared PRESEASON channel and announce it
 *   preseason_proposal          {event, proposal_id}   'proposed': post Accept/Decline;
 *                                                     'answered': redraw it and announce the outcome
 *   preseason_pairing_cancelled {pairing_id}
 *   preseason_channel_removed   {channel_id}    a replaced schedule's channel
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  createChannel,
  deleteChannel,
  discordErrorCode,
  editMessage,
  getGuildChannels,
  sendMessage,
  UNKNOWN_CHANNEL,
  UNKNOWN_MESSAGE,
  type MessagePayload,
} from './discord.ts'
import { loadChannels, loadRosterDiscordIds } from './match_data.ts'
import { withMentions } from './match_messages.ts'
import {
  castingNotice,
  declinedNotice,
  inviteMessage,
  pairingCancelledNotice,
  pairingIntro,
  PRESEASON_CATEGORY_NAME,
  preseasonChannelName,
  preseasonOverwrites,
  proposalMessage,
  scheduledNotice,
  teamPairingNotice,
  type ProposalStatus,
  type ProposalView,
  type PsTeam,
} from './preseason_messages.ts'

const REASON = 'BIL preseason'

interface TeamRow extends PsTeam {
  discord_role_id: string | null
  discord_channel_id: string | null
  captainDiscordIds: string[]
}

const TEAM_COLS =
  'id, name, tag, discord_role_id, discord_channel_id, captain:profiles!teams_captain_id_fkey(discord_id), co:profiles!teams_co_captain_id_fkey(discord_id)'

// deno-lint-ignore no-explicit-any
function toTeam(t: any): TeamRow {
  return {
    id: t.id,
    name: t.name,
    tag: t.tag,
    discord_role_id: t.discord_role_id ?? null,
    discord_channel_id: t.discord_channel_id ?? null,
    captainDiscordIds: [t.captain?.discord_id, t.co?.discord_id].filter((x): x is string => Boolean(x)),
  }
}

// deno-lint-ignore no-explicit-any
const personName = (p: any): string | null => p?.discord_username ?? p?.activision_id ?? null

/** Edit a stored message; false when it no longer exists (so the caller can post a new one). */
async function editIfThere(channelId: string | null, messageId: string | null, payload: MessagePayload): Promise<boolean> {
  if (!channelId || !messageId || messageId === 'sending') return false
  try {
    await editMessage(channelId, messageId, payload)
    return true
  } catch (err) {
    const code = discordErrorCode(err)
    if (code === UNKNOWN_MESSAGE || code === UNKNOWN_CHANNEL) return false
    throw err
  }
}

function discordEnv(): { guildId: string; botUserId: string } {
  const guildId = Deno.env.get('DISCORD_GUILD_ID')
  const botUserId = Deno.env.get('DISCORD_APP_ID')
  if (!guildId || !botUserId) throw new Error('DISCORD_GUILD_ID / DISCORD_APP_ID not set')
  return { guildId, botUserId }
}

// ---- Invites ---------------------------------------------------------------------------------

/** The invite as it should look now, or null if the team has no invite. */
export async function buildInvite(db: SupabaseClient, teamId: string, siteUrl: string) {
  const { data } = await db
    .from('preseason_interest')
    .select(
      'interested, discord_channel_id, discord_message_id, responder:profiles!preseason_interest_responded_by_fkey(discord_username, activision_id), ' +
        `team:teams!inner(${TEAM_COLS}, season:seasons!inner(preseason_generated_at))`,
    )
    .eq('team_id', teamId)
    .maybeSingle()
  if (!data) return null
  // deno-lint-ignore no-explicit-any
  const row = data as any
  const team = toTeam(row.team)
  return {
    team,
    channelId: row.discord_channel_id as string | null,
    messageId: row.discord_message_id as string | null,
    payload: inviteMessage(
      { team, interested: row.interested, respondedBy: personName(row.responder), closed: Boolean(row.team.season.preseason_generated_at) },
      siteUrl,
    ),
  }
}

/** Posts the invite in the team channel (pinging the roster), or redraws it. */
export async function syncInvite(db: SupabaseClient, teamId: string, siteUrl: string) {
  const inv = await buildInvite(db, teamId, siteUrl)
  if (!inv) return
  if (await editIfThere(inv.channelId, inv.messageId, inv.payload)) return
  if (!inv.team.discord_channel_id) throw new Error(`${inv.team.tag} has no team channel yet; retrying later`)
  const roster = await loadRosterDiscordIds(db, teamId)
  const msg = await sendMessage(inv.team.discord_channel_id, withMentions(inv.payload, roster))
  await db.from('preseason_interest').update({ discord_channel_id: inv.team.discord_channel_id, discord_message_id: msg.id }).eq('team_id', teamId)
}

// ---- Pairings --------------------------------------------------------------------------------

async function loadPairing(db: SupabaseClient, pairingId: string) {
  const { data } = await db
    .from('preseason_pairings')
    .select(
      `id, status, match_id, discord_channel_id, home:teams!preseason_pairings_home_team_id_fkey(${TEAM_COLS}), ` +
        `away:teams!preseason_pairings_away_team_id_fkey(${TEAM_COLS})`,
    )
    .eq('id', pairingId)
    .maybeSingle()
  if (!data) return null
  // deno-lint-ignore no-explicit-any
  const p = data as any
  return {
    id: p.id as string,
    status: p.status as string,
    matchId: p.match_id as string | null,
    channelId: p.discord_channel_id as string | null,
    home: toTeam(p.home),
    away: toTeam(p.away),
  }
}

/** The "Preseason" category, created on first use (its id lives in app_settings.discord_preseason). */
async function ensureCategory(db: SupabaseClient, guildId: string, channels: { id: string; name: string; type: number }[]): Promise<string> {
  const { data } = await db.from('app_settings').select('value').eq('key', 'discord_preseason').maybeSingle()
  const stored = (data?.value as { category_id?: string } | null)?.category_id
  const found =
    channels.find((c) => c.id === stored && c.type === 4) ??
    channels.find((c) => c.type === 4 && c.name.toLowerCase() === PRESEASON_CATEGORY_NAME.toLowerCase())
  const id = found?.id ?? (await createChannel(guildId, { name: PRESEASON_CATEGORY_NAME, type: 4 }, REASON)).id
  if (id !== stored) await db.from('app_settings').upsert({ key: 'discord_preseason', value: { category_id: id } })
  return id
}

/** Creates the shared channel (if it doesn't exist) and announces the pairing to both teams. */
export async function setupPairing(db: SupabaseClient, pairingId: string, siteUrl: string) {
  const p = await loadPairing(db, pairingId)
  if (!p || p.status === 'cancelled') return
  const { guildId, botUserId } = discordEnv()
  const channels = await getGuildChannels(guildId)
  if (p.channelId && channels.some((c) => c.id === p.channelId)) return
  if (!p.home.discord_role_id || !p.away.discord_role_id) {
    throw new Error(`Team roles for ${p.home.tag} / ${p.away.tag} aren't in Discord yet; retrying later`)
  }

  const { data: s } = await db.from('app_settings').select('value').eq('key', 'discord').maybeSingle()
  const roles = (s?.value as { roles?: { admin?: string; caster?: string } } | null)?.roles ?? {}
  const categoryId = await ensureCategory(db, guildId, channels)
  const channelId = (
    await createChannel(
      guildId,
      {
        name: preseasonChannelName(p.home, p.away),
        parent_id: categoryId,
        topic: `Preseason: ${p.home.name} [${p.home.tag}] vs ${p.away.name} [${p.away.tag}]. Agree on a time here, then propose it with /preseason.`,
        permission_overwrites: preseasonOverwrites({
          guildId,
          teamRoleIds: [p.home.discord_role_id, p.away.discord_role_id],
          adminRoleId: roles.admin ?? null,
          casterRoleId: roles.caster ?? null,
          botUserId,
        }),
      },
      REASON,
    )
  ).id
  // Saved before posting, so a failed post can't create a second channel on retry.
  await db.from('preseason_pairings').update({ discord_channel_id: channelId }).eq('id', pairingId)

  const [homeRoster, awayRoster] = await Promise.all([loadRosterDiscordIds(db, p.home.id), loadRosterDiscordIds(db, p.away.id)])
  await sendMessage(channelId, withMentions(pairingIntro(p, siteUrl), [...homeRoster, ...awayRoster]))
  for (const [team, opp] of [[p.home, p.away], [p.away, p.home]] as const) {
    if (!team.discord_channel_id) continue
    await sendMessage(team.discord_channel_id, teamPairingNotice(team, opp, channelId)).catch((err) =>
      console.error('preseason team notice failed', err),
    )
  }
  // The invites close once pairings exist.
  for (const t of [p.home, p.away]) await syncInvite(db, t.id, siteUrl).catch((err) => console.error('invite refresh failed', err))
}

export async function announceCancelledPairing(db: SupabaseClient, pairingId: string) {
  const p = await loadPairing(db, pairingId)
  if (!p) return
  const payload = pairingCancelledNotice(p)
  for (const ch of [p.channelId, p.home.discord_channel_id, p.away.discord_channel_id]) {
    if (ch) await sendMessage(ch, payload).catch((err) => console.error('preseason cancel notice failed', err))
  }
}

export async function removeChannel(channelId: string) {
  try {
    await deleteChannel(channelId, REASON)
  } catch (err) {
    if (discordErrorCode(err) !== UNKNOWN_CHANNEL) throw err
  }
}

// ---- Proposals -------------------------------------------------------------------------------

export async function loadProposal(db: SupabaseClient, proposalId: string) {
  const { data } = await db
    .from('preseason_proposals')
    .select('id, pairing_id, team_id, proposed_at, status, discord_channel_id, discord_message_id, responder:profiles!preseason_proposals_responded_by_fkey(discord_username, activision_id)')
    .eq('id', proposalId)
    .maybeSingle()
  if (!data) return null
  const pairing = await loadPairing(db, data.pairing_id)
  if (!pairing) return null
  const { data: match } = pairing.matchId
    ? await db.from('matches').select('scheduled_at').eq('id', pairing.matchId).maybeSingle()
    : { data: null }
  const proposer = data.team_id === pairing.home.id ? pairing.home : pairing.away
  const other = proposer.id === pairing.home.id ? pairing.away : pairing.home
  const view: ProposalView = {
    id: data.id,
    proposer,
    other,
    proposedAt: data.proposed_at,
    status: data.status as ProposalStatus,
    responder: personName((data as { responder?: unknown }).responder),
    // Only while pending: once accepted the match time *is* the proposal.
    currentAt: data.status === 'pending' ? (match?.scheduled_at ?? null) : null,
  }
  return {
    view,
    pairing,
    proposer,
    other,
    channelId: data.discord_channel_id as string | null,
    messageId: data.discord_message_id as string | null,
  }
}

/** Posts a new proposal (Accept/Decline, pinging the other team's captains). Once only. */
export async function postProposal(db: SupabaseClient, proposalId: string, siteUrl: string) {
  const p = await loadProposal(db, proposalId)
  if (!p || p.view.status !== 'pending' || p.messageId) return
  if (!p.pairing.channelId) throw new Error('The preseason channel isn\'t ready yet; retrying later')
  // Claim it first: the /preseason command and the scheduler may both try.
  const { data: claimed } = await db
    .from('preseason_proposals')
    .update({ discord_message_id: 'sending' })
    .eq('id', proposalId)
    .is('discord_message_id', null)
    .select('id')
  if (!claimed?.length) return
  try {
    const msg = await sendMessage(p.pairing.channelId, withMentions(proposalMessage(p.view, siteUrl), p.other.captainDiscordIds))
    await db.from('preseason_proposals').update({ discord_channel_id: p.pairing.channelId, discord_message_id: msg.id }).eq('id', proposalId)
  } catch (err) {
    await db.from('preseason_proposals').update({ discord_message_id: null }).eq('id', proposalId)
    throw err
  }
}

/**
 * After an answer or a withdrawal: redraws the proposal (no buttons) and announces the outcome.
 * Runs once per answer (the outbox's 'answered' event).
 */
export async function finishProposal(db: SupabaseClient, proposalId: string, siteUrl: string) {
  const p = await loadProposal(db, proposalId)
  if (!p || p.view.status === 'pending') return
  await editIfThere(p.channelId, p.messageId, proposalMessage(p.view, siteUrl))
  const shared = p.pairing.channelId
  if (p.view.status === 'declined' && shared) {
    await sendMessage(shared, withMentions(declinedNotice(p.view), p.proposer.captainDiscordIds))
    return
  }
  if (p.view.status !== 'accepted' || !p.pairing.matchId) return

  // A move if an earlier proposal on this pairing was already accepted.
  const { count } = await db
    .from('preseason_proposals')
    .select('id', { count: 'exact', head: true })
    .eq('pairing_id', p.pairing.id)
    .eq('status', 'accepted')
    .lt('responded_at', new Date().toISOString())
  const d = { home: p.pairing.home, away: p.pairing.away, at: p.view.proposedAt, matchId: p.pairing.matchId, moved: (count ?? 0) > 1 }
  if (shared) {
    const [homeRoster, awayRoster] = await Promise.all([loadRosterDiscordIds(db, d.home.id), loadRosterDiscordIds(db, d.away.id)])
    await sendMessage(shared, withMentions(scheduledNotice(d, siteUrl), [...homeRoster, ...awayRoster]))
  }
  const { admin } = await loadChannels(db)
  if (admin) await sendMessage(admin, castingNotice(d, siteUrl)).catch((err) => console.error('preseason casting notice failed', err))
}

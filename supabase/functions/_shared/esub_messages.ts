/**
 * Emergency sub messages (rule 4.3–4.4). Pure builders, tested in esub_messages_test.ts.
 *   - DM to the free agent with Accept / Decline ("esub:accept:<id>" / "esub:decline:<id>")
 *   - #admin-only when a captain asks (heads-up) and again once the player accepts (ready to approve)
 *   - the requesting team's channel when the player declines or an admin decides
 */
import type { MessagePayload } from './discord.ts'
import { halEmbed, HAL_LOSS, HAL_WIN } from './embeds.ts'
import { discordTime, type MsgMatch, type MsgTeam } from './match_messages.ts'

const NO_PINGS = { parse: [] as ('roles' | 'users' | 'everyone')[] }

export interface EsubRequest {
  id: string
  /** The requesting team. */
  team: MsgTeam
  match: MsgMatch
  player: string
  captain: string
  note: string | null
  /** Players the captain marked out for this match. */
  out?: { name: string; reason: string | null }[]
}

const matchLine = (m: MsgMatch) => `${m.home.tag} vs ${m.away.tag} (week ${m.week}), ${discordTime(m.scheduledAt)}`

export const esubButtons = (requestId: string, siteUrl: string, disabled = false) => ({
  type: 1,
  components: [
    { type: 2, style: 3, label: 'Accept', custom_id: `esub:accept:${requestId}`, disabled },
    { type: 2, style: 4, label: 'Decline', custom_id: `esub:decline:${requestId}`, disabled },
    { type: 2, style: 5, label: 'View on site', url: `${siteUrl}/profile` },
  ],
})

/** The DM asking the free agent. */
export function esubInviteDm(r: EsubRequest, siteUrl: string): MessagePayload {
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: 'Emergency sub request',
        description:
          `**${r.captain}** (captain of **${r.team.name} [${r.team.tag}]**) wants you as an emergency sub for one match:\n` +
          `${matchLine(r.match)}\n\n` +
          "You'd play this match only and stay a free agent. Nothing happens unless you accept, and an admin approves it after that (rule 4.3)." +
          (r.note ? `\n\n> ${r.note.replace(/\n/g, '\n> ')}` : ''),
      }),
    ],
    components: [esubButtons(r.id, siteUrl)],
  }
}

/** The DM after the player answered (buttons disabled). */
export function esubAnsweredDm(r: EsubRequest, accepted: boolean, siteUrl: string): MessagePayload {
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: accepted ? 'You accepted' : 'You declined',
        color: accepted ? HAL_WIN : HAL_LOSS,
        description: accepted
          ? `You're down as ${r.team.tag}'s emergency sub for ${matchLine(r.match)}. An admin still has to approve it; you'll get a DM when they do.`
          : `You declined ${r.team.tag}'s emergency sub request for ${matchLine(r.match)}. Their captain has been told.`,
      }),
    ],
    components: [esubButtons(r.id, siteUrl, true)],
  }
}

const outLine = (r: EsubRequest) =>
  r.out?.length ? `\nOut: ${r.out.map((o) => `${o.name}${o.reason ? ` (${o.reason})` : ''}`).join(', ')}` : ''

/**
 * #admin-only. "requested": heads-up when the captain asks (nothing to do yet). "accepted": the
 * player said yes and an admin needs to approve; pings the HAL Admin role (pingRoleId).
 */
export function esubAdminMessage(
  r: EsubRequest,
  siteUrl: string,
  stage: 'requested' | 'accepted',
  pingRoleId?: string | null,
): MessagePayload {
  const ping = stage === 'accepted' && pingRoleId ? `<@&${pingRoleId}> ` : ''
  const head =
    stage === 'requested'
      ? `**Emergency sub requested:** ${r.captain} asked ${r.player} to play for **${r.team.tag}** in ${matchLine(r.match)}. Waiting for the player to accept.`
      : `**Emergency sub to approve:** ${r.player} accepted to play for **${r.team.tag}** in ${matchLine(r.match)}. Requested by ${r.captain}.`
  return {
    allowed_mentions: ping && pingRoleId ? { parse: [], roles: [pingRoleId] } : NO_PINGS,
    content: `${ping}${head}${outLine(r)}${r.note ? `\nNote: "${r.note}"` : ''}\n${siteUrl}/admin/rosters`,
  }
}

export type EsubOutcome = 'declined' | 'approved' | 'denied'

/** The requesting team's channel. */
export function esubTeamMessage(r: EsubRequest, outcome: EsubOutcome, siteUrl: string): MessagePayload {
  const text: Record<EsubOutcome, string> = {
    declined: `${r.player} declined your emergency sub request for ${matchLine(r.match)}. Try another free agent on the match page.`,
    approved: `${r.player} is approved as your emergency sub for ${matchLine(r.match)}. Check them in like anyone else.`,
    denied: `An admin denied the emergency sub request for ${r.player} for ${matchLine(r.match)}.`,
  }
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: outcome === 'approved' ? 'Emergency sub approved' : outcome === 'declined' ? 'Emergency sub declined' : 'Emergency sub denied',
        color: outcome === 'approved' ? HAL_WIN : HAL_LOSS,
        description: `${text[outcome]}\n[Match page](${siteUrl}/matches/${r.match.id})`,
      }),
    ],
  }
}

/** DM to the player after an admin decides. */
export function esubDecisionDm(r: EsubRequest, approved: boolean): MessagePayload {
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: approved ? "You're in" : 'Emergency sub not approved',
        color: approved ? HAL_WIN : HAL_LOSS,
        description: approved
          ? `You're approved to play for **${r.team.name} [${r.team.tag}]** in ${matchLine(r.match)}. Their captain checks you in 15 minutes before. You stay a free agent.`
          : `An admin didn't approve you as ${r.team.tag}'s emergency sub for ${matchLine(r.match)}.`,
      }),
    ],
  }
}

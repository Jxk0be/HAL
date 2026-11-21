/**
 * #admin-only alerts for anything waiting on an admin. Every alert pings the HAL Admin role
 * (all admins: recusal is enforced when they act on the site, not on who gets told).
 * Pure builders, tested in admin_alerts_test.ts.
 */
import type { MessagePayload } from './discord.ts'
import { halEmbed, HAL_LOSS } from './embeds.ts'
import { discordTime, type MsgMatch } from './match_messages.ts'

/** Adds a HAL Admin role ping to a message (no ping when the role id isn't known yet). */
export function withAdminPing(payload: MessagePayload, roleId: string | null): MessagePayload {
  if (!roleId) return { ...payload, allowed_mentions: { parse: [] } }
  return {
    ...payload,
    content: `<@&${roleId}>${payload.content ? ` ${payload.content}` : ''}`,
    allowed_mentions: { parse: [], roles: [roleId] },
  }
}

const matchLabel = (m: MsgMatch) => `${m.home.tag} vs ${m.away.tag} (week ${m.week}, ${discordTime(m.scheduledAt, 'f')})`

function alert(title: string, description: string, url: string): MessagePayload {
  return { embeds: [halEmbed({ title, description, url, color: HAL_LOSS })] }
}

/** Sent when a pending team reaches 4 players (rule 3.5: no approval below 4). */
export function teamPendingAlert(team: { name: string; tag: string; captain: string; players: number }, siteUrl: string): MessagePayload {
  return alert(
    `Team ready to approve: ${team.name} [${team.tag}]`,
    `${team.players} players, captain ${team.captain}. Approve or deny it on Season → Team approvals (rule 3.5).\n[Team approvals](${siteUrl}/admin/season)`,
    `${siteUrl}/admin/season`,
  )
}

export function mismatchAlert(m: MsgMatch, fields: number, siteUrl: string): MessagePayload {
  return alert(
    `Reports don't match: ${m.home.tag} vs ${m.away.tag}`,
    `${matchLabel(m)}: ${fields} ${fields === 1 ? 'value differs' : 'values differ'} between the two captains' reports. Decide from the screenshots (rule 9.3).\n[Open the mismatch](${siteUrl}/admin/mismatches/${m.id})`,
    `${siteUrl}/admin/mismatches/${m.id}`,
  )
}

export function disputeAlert(m: MsgMatch, category: string, siteUrl: string, threadId?: string | null): MessagePayload {
  return alert(
    `Dispute opened: ${m.home.tag} vs ${m.away.tag}`,
    `**${category}** dispute on ${matchLabel(m)}.${threadId ? ` Thread: <#${threadId}>.` : ''} Admins on either team are recused.\n[Disputes](${siteUrl}/admin/disputes)`,
    `${siteUrl}/admin/disputes`,
  )
}

export function unreportedAlert(m: MsgMatch, siteUrl: string): MessagePayload {
  return alert(
    `No result yet: ${m.home.tag} vs ${m.away.tag}`,
    `${matchLabel(m)} started over 24 hours ago and has no confirmed result: neither captain reported with screenshots. Set the result or a forfeit.\n[Match page](${siteUrl}/matches/${m.id})`,
    `${siteUrl}/matches/${m.id}`,
  )
}

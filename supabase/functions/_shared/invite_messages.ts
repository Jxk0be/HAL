/**
 * Team invite messages. Pure builders, tested in invite_messages_test.ts.
 *   - DM to the player with Accept / Decline ("invite:accept:<id>" / "invite:decline:<id>")
 *   - the DM once the invite closes (buttons off)
 *   - a note in the team's channel when the player accepts or declines
 */
import type { MessagePayload } from './discord.ts'
import { halEmbed, HAL_LOSS, HAL_WIN } from './embeds.ts'

export interface InviteInfo {
  id: string
  team: { id: string; name: string; tag: string }
  captain: string
  player: string
  role: 'starter' | 'sub' | null
  expiresAt: string
}

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'

const NO_PINGS = { parse: [] as ('roles' | 'users' | 'everyone')[] }
const when = (iso: string) => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:D>`

function buttons(i: InviteInfo, siteUrl: string, disabled: boolean) {
  return {
    type: 1,
    components: [
      { type: 2, style: 3, label: 'Accept', custom_id: `invite:accept:${i.id}`, disabled },
      { type: 2, style: 4, label: 'Decline', custom_id: `invite:decline:${i.id}`, disabled },
      { type: 2, style: 5, label: 'View team', url: `${siteUrl}/teams/${i.team.id}` },
    ],
  }
}

export function inviteDm(i: InviteInfo, siteUrl: string): MessagePayload {
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `${i.team.name} [${i.team.tag}] invited you`,
        url: `${siteUrl}/teams/${i.team.id}`,
        description:
          `**${i.captain}** invited you to join **${i.team.name}**${i.role ? ` as a ${i.role}` : ''} in Heaven's Arena League.\n` +
          `Accept below or on your [profile](${siteUrl}/profile). The invite expires ${when(i.expiresAt)}.\n` +
          'Accepting puts you on the roster and cancels your other invites this season (3.6).',
      }),
    ],
    components: [buttons(i, siteUrl, false)],
  }
}

export function inviteClosedDm(i: InviteInfo, status: InviteStatus, siteUrl: string): MessagePayload {
  const text: Record<InviteStatus, { title: string; body: string; color?: number }> = {
    pending: { title: `${i.team.name} invited you`, body: 'Waiting for your answer.' },
    accepted: { title: `You joined ${i.team.name}`, body: `You're on the roster. Your team channel and roles are set up within a minute.`, color: HAL_WIN },
    declined: { title: 'Invite declined', body: `You declined ${i.team.name}'s invite. Their captain has been told.`, color: HAL_LOSS },
    cancelled: { title: 'Invite closed', body: `This invite from ${i.team.name} was cancelled (withdrawn, or you joined another team).` },
    expired: { title: 'Invite expired', body: `This invite from ${i.team.name} expired.` },
  }
  const t = text[status]
  return {
    allowed_mentions: NO_PINGS,
    embeds: [halEmbed({ title: t.title, description: t.body, url: `${siteUrl}/teams/${i.team.id}`, color: t.color })],
    components: [buttons(i, siteUrl, true)],
  }
}

/** The team's channel when the player answers. */
export function inviteTeamNotice(i: InviteInfo, accepted: boolean, siteUrl: string): MessagePayload {
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: accepted ? `${i.player} joined the team` : `${i.player} declined the invite`,
        color: accepted ? HAL_WIN : HAL_LOSS,
        description: accepted
          ? `${i.player} accepted ${i.captain}'s invite and is on the roster${i.role ? ` as a ${i.role}` : ''}.\n[My team](${siteUrl}/my-team)`
          : `${i.player} declined ${i.captain}'s invite.\n[Find more players](${siteUrl}/free-agents)`,
      }),
    ],
  }
}

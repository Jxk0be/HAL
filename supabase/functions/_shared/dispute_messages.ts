/** Dispute thread messages. Pure builders, tested in dispute_messages_test.ts. */
import type { MessagePayload } from './discord.ts'
import { halEmbed, HAL_LOSS, HAL_WIN } from './embeds.ts'

export const CATEGORY_LABEL: Record<string, string> = {
  score: 'Score',
  stats: 'Player stats',
  conduct: 'Conduct',
  cheating: 'Cheating',
  eligibility: 'Eligibility',
  other: 'Other',
}

export const DISPUTE_CHOICES = Object.entries(CATEGORY_LABEL).map(([value, name]) => ({ name, value }))

/** "Dispute #1a2b3c4d · SRPH vs GATE" (Discord thread names max 100). */
export function disputeThreadName(disputeId: string, homeTag: string, awayTag: string): string {
  return `Dispute #${disputeId.slice(0, 8)} · ${homeTag} vs ${awayTag}`.slice(0, 100)
}

export interface OpeningInput {
  disputeId: string
  matchId: string
  week: number
  homeName: string
  awayName: string
  openedByTeam: string
  category: string
  reason: string
  evidence: { url: string | null; note: string | null; image: boolean }[]
  captainIds: string[]
  adminIds: string[]
}

export function disputeOpeningMessage(d: OpeningInput, siteUrl: string): MessagePayload {
  const evidence = d.evidence.length
    ? d.evidence
        .map((e, i) => (e.url ? `• [${e.note || `Link ${i + 1}`}](${e.url})` : `• ${e.note || `Image ${i + 1}`} (image: see the admin page or match page)`))
        .join('\n')
    : 'None attached.'
  const mentions = [...d.captainIds, ...d.adminIds]
  return {
    content: [
      d.captainIds.length ? `Captains: ${d.captainIds.map((id) => `<@${id}>`).join(' ')}` : null,
      d.adminIds.length ? `BIL Admin: ${d.adminIds.map((id) => `<@${id}>`).join(' ')}` : 'BIL Admin: no admins available (all recused). The owner will step in.',
    ]
      .filter(Boolean)
      .join('\n'),
    allowed_mentions: { users: mentions },
    embeds: [
      halEmbed({
        title: `${CATEGORY_LABEL[d.category] ?? d.category} dispute: ${d.homeName} vs ${d.awayName}`,
        url: `${siteUrl}/matches/${d.matchId}`,
        color: HAL_LOSS,
        description: `Opened by **${d.openedByTeam}** · week ${d.week}\n\n${d.reason.slice(0, 3500)}`,
        fields: [
          { name: 'Evidence', value: evidence.slice(0, 1024), inline: false },
          { name: 'Links', value: `[Match page](${siteUrl}/matches/${d.matchId}) · [Admin disputes](${siteUrl}/admin/disputes)`, inline: false },
        ],
      }),
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: 'Resolve (admins)', url: `${siteUrl}/admin/disputes` },
          { type: 2, style: 5, label: 'Match page', url: `${siteUrl}/matches/${d.matchId}` },
        ],
      },
    ],
  }
}

export function recusedNote(count: number): MessagePayload | null {
  if (!count) return null
  return {
    allowed_mentions: { parse: [] },
    content: `Recused staff excluded: ${count} admin${count === 1 ? '' : 's'} on one of these teams ${count === 1 ? 'was' : 'were'} not added, per the recusal rule.`,
  }
}

export function disputeResolvedMessage(resolution: string | null, siteUrl: string, matchId: string): MessagePayload {
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      halEmbed({
        title: 'Dispute resolved',
        url: `${siteUrl}/matches/${matchId}`,
        color: HAL_WIN,
        description: `${(resolution ?? 'Resolved by the admins.').slice(0, 3500)}\n\nThis thread is now closed. The decision is public on the [match page](${siteUrl}/matches/${matchId}) and the audit log.`,
      }),
    ],
  }
}

export function disputeReopenedMessage(): MessagePayload {
  return { allowed_mentions: { parse: [] }, content: 'An admin reopened this dispute.' }
}

export function disputeCommentMessage(author: string, staff: boolean, body: string): MessagePayload {
  return {
    allowed_mentions: { parse: [] },
    content: `**${author}**${staff ? ' (staff)' : ''} on the site:\n${body.slice(0, 1800)}`,
  }
}

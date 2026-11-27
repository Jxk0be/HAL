/** #teams-recruiting card and the team-channel "someone's interested" notice. Pure builders, tested in recruit_messages_test.ts. */
import type { MessagePayload } from './discord.ts'
import { halEmbed } from './embeds.ts'

export type LookingFor = 'starter' | 'sub' | 'any'

export interface RecruitPost {
  id: string
  teamId: string
  teamName: string
  teamTag: string
  logoUrl: string | null
  lookingFor: LookingFor
  /** Empty = any role. */
  roles: string[]
  availability: string | null
  note: string | null
  /** Open spots right now. */
  open: number
  startersOpen: number
  subsOpen: number
}

const NEED: Record<LookingFor, string> = { starter: 'a starter', sub: 'a sub', any: 'a starter or sub' }
export const lookingForText = (l: LookingFor) => NEED[l] ?? 'players'

function spotsText(p: RecruitPost): string {
  const parts: string[] = []
  if (p.startersOpen > 0) parts.push(`${p.startersOpen} starter`)
  if (p.subsOpen > 0) parts.push(`${p.subsOpen} sub`)
  return parts.length ? parts.join(', ') : `${p.open}`
}

export function recruitPostMessage(p: RecruitPost, siteUrl: string): MessagePayload {
  const fields = [
    { name: 'Looking for', value: p.lookingFor === 'any' ? 'Starter or sub' : p.lookingFor === 'starter' ? 'Starter' : 'Sub', inline: true },
    { name: p.roles.length > 1 ? 'Roles' : 'Role', value: p.roles.length ? p.roles.join(', ') : 'Any', inline: true },
    { name: 'Open spots', value: spotsText(p), inline: true },
  ]
  if (p.availability) fields.push({ name: 'When they play', value: p.availability, inline: false })
  const teamUrl = `${siteUrl}/teams/${p.teamId}`
  return {
    content: `**${p.teamName}** [${p.teamTag}] is looking for ${lookingForText(p.lookingFor)}`,
    allowed_mentions: { parse: [] },
    embeds: [
      halEmbed({
        title: `${p.teamName} [${p.teamTag}]`,
        url: teamUrl,
        description: p.note ?? undefined,
        fields,
        thumbnail: p.logoUrl ? { url: p.logoUrl } : undefined,
      }),
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: "I'm interested", custom_id: `recruit:interest:${p.id}` },
          { type: 2, style: 5, label: 'Team page', url: teamUrl },
        ],
      },
    ],
  }
}

/** Team channel: a player pressed "I'm interested". Pings the captains only. */
export function interestNotice(
  player: { id: string; name: string; discordId: string | null; role: string | null },
  captainIds: string[],
  siteUrl: string,
): MessagePayload {
  const who = player.discordId ? `**${player.name}** (<@${player.discordId}>)` : `**${player.name}**`
  return {
    content: captainIds.map((id) => `<@${id}>`).join(' ') || undefined,
    allowed_mentions: { parse: [], users: captainIds },
    embeds: [
      halEmbed({
        title: `${player.name} is interested in joining`,
        url: `${siteUrl}/players/${player.id}`,
        description:
          `${who} pressed **I'm interested** on your recruiting post${player.role ? ` (plays ${player.role})` : ''}.\n` +
          `[See their profile](${siteUrl}/players/${player.id}) · [Invite them from My team](${siteUrl}/my-team)`,
      }),
    ],
  }
}

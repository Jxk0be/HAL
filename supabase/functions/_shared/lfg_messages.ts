/** #lfg-free-agents post and modal. Pure builders, tested in lfg_messages_test.ts. */
import type { MessagePayload } from './discord.ts'
import { halEmbed } from './embeds.ts'

export interface LfgPost {
  userId: string
  discordId: string
  activisionId: string | null
  discordUsername: string | null
  platform: string | null
  role: string | null
  availability: string | null
  note: string | null
}

const PLATFORM: Record<string, string> = { playstation: 'PlayStation', xbox: 'Xbox', pc: 'PC (controller)' }

export function lfgPostMessage(p: LfgPost, siteUrl: string): MessagePayload {
  const fields = [
    { name: 'Platform', value: PLATFORM[p.platform ?? ''] ?? 'Not set', inline: true },
    { name: 'Role', value: p.role ?? 'Any', inline: true },
  ]
  if (p.availability) fields.push({ name: 'Availability', value: p.availability, inline: false })
  return {
    // Mention without pinging, so captains can click through to the player. A mention that doesn't
    // ping arrives without the user's name, so Discord shows "@unknown-user" to anyone whose app
    // hasn't loaded that member yet: the plain name in front keeps it readable for everyone.
    content: `**${p.discordUsername ?? p.activisionId ?? 'A player'}** (<@${p.discordId}>) is looking for a team`,
    allowed_mentions: { parse: [] },
    embeds: [
      halEmbed({
        title: p.activisionId ?? p.discordUsername ?? 'Free agent',
        url: `${siteUrl}/players/${p.userId}`,
        description: p.note ?? undefined,
        fields,
      }),
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: 'Invite to team', custom_id: `lfg:invite:${p.userId}` },
          { type: 2, style: 5, label: 'Profile', url: `${siteUrl}/players/${p.userId}` },
        ],
      },
    ],
  }
}

/** The /lfg post modal (Discord allows 5 inputs; BIL uses 3), prefilled when editing. */
export function lfgModal(existing: { role: string | null; availability: string | null; note: string | null } | null) {
  const input = (custom_id: string, label: string, style: 1 | 2, max: number, value: string | null, placeholder: string) => ({
    type: 1,
    components: [
      {
        type: 4,
        custom_id,
        label,
        style,
        required: false,
        max_length: max,
        placeholder,
        ...(value ? { value } : {}),
      },
    ],
  })
  return {
    custom_id: 'lfg:post',
    title: existing ? 'Edit your free agent post' : 'Post as a free agent',
    components: [
      input('role', 'Preferred role (AR, SMG or Flex)', 1, 5, existing?.role ?? null, 'Flex'),
      input('availability', 'Availability', 1, 280, existing?.availability ?? null, 'Weeknights after 8 PM ET'),
      input('note', 'About you', 2, 1000, existing?.note ?? null, 'Experience, comms, what you want in a team'),
    ],
  }
}

/** Values from a modal submit: { custom_id: value }. */
export function modalValues(components: unknown[] | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of (components ?? []) as { components?: { custom_id?: string; value?: string }[] }[]) {
    for (const c of row.components ?? []) if (c.custom_id) out[c.custom_id] = c.value ?? ''
  }
  return out
}

export function inviteDm(captain: string, team: string, siteUrl: string): MessagePayload {
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      halEmbed({
        title: `${team} invited you to join`,
        url: `${siteUrl}/profile`,
        description: `**${captain}** invited you to **${team}** in Blackhat Invitational League.\n[Accept or decline on your profile](${siteUrl}/profile). Invites expire after a few days.`,
      }),
    ],
  }
}

/**
 * Preseason Discord messages. Pure builders (no I/O), tested in preseason_messages_test.ts; the I/O
 * is in preseason_flow.ts. Buttons ("feature:action:id"):
 *   preseason:in:<teamId> / preseason:out:<teamId>             a captain answers the invite
 *   preseason:accept:<proposalId> / preseason:decline:<id>     the other captain answers a proposed time
 */
import { perms, PERMISSIONS, type MessagePayload, type PermissionOverwrite } from './discord.ts'
import { halEmbed, HAL_LOSS, HAL_WIN } from './embeds.ts'
import { discordTime } from './match_messages.ts'
import { boldText } from '../discord-sync/plan.ts'

export interface PsTeam {
  id: string
  name: string
  tag: string
}

export type ProposalStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'

export const PRESEASON_CATEGORY_NAME = 'Preseason'
/** Matches need this long to themselves (mirrors preseason_conflict in the database). */
export const PRESEASON_GAP_HOURS = 2

const NO_PINGS = { parse: [] as ('roles' | 'users' | 'everyone')[] }
const button = (style: 1 | 2 | 3 | 4, label: string, custom_id: string) => ({ type: 2, style, label, custom_id })
const linkButton = (label: string, url: string) => ({ type: 2, style: 5, label, url })
const row = (...components: unknown[]) => ({ type: 1, components })
const matchUrl = (siteUrl: string, id: string) => `${siteUrl}/matches/${id}`
const myTeamUrl = (siteUrl: string) => `${siteUrl}/my-team`

/** ASCII letters and digits only (Discord channel names). */
const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '')
    .slice(0, 12)

/**
 * Shared channel name, e.g. "𝗣𝗥𝗘𝗦𝗘𝗔𝗦𝗢𝗡-𝗡𝗠𝗚-vs-𝘁𝗩". Bold letters keep their capitals (Discord
 * lowercases plain ASCII in text channel names), like the team channels.
 */
export function preseasonChannelName(a: PsTeam, b: PsTeam): string {
  const tag = (t: PsTeam) => boldText(slug(t.tag) || 'team')
  return `${boldText('PRESEASON')}-${tag(a)}-vs-${tag(b)}`
}

/** Both teams, BIL Admin and BIL Caster can see and talk; everyone else can't see it. */
export function preseasonOverwrites(o: {
  guildId: string
  teamRoleIds: string[]
  adminRoleId: string | null
  casterRoleId: string | null
  botUserId: string
}): PermissionOverwrite[] {
  const member = perms(
    PERMISSIONS.VIEW_CHANNEL,
    PERMISSIONS.SEND_MESSAGES,
    PERMISSIONS.READ_MESSAGE_HISTORY,
    PERMISSIONS.ATTACH_FILES,
    PERMISSIONS.EMBED_LINKS,
  )
  const roles = [...o.teamRoleIds, o.adminRoleId, o.casterRoleId].filter((x): x is string => Boolean(x))
  return [
    { id: o.guildId, type: 0, deny: perms(PERMISSIONS.VIEW_CHANNEL) },
    ...[...new Set(roles)].map((id) => ({ id, type: 0 as const, allow: member })),
    { id: o.botUserId, type: 1, allow: member },
  ]
}

/** The invite in a team channel, redrawn when a captain answers and when the pairings are made. */
export function inviteMessage(
  d: { team: PsTeam; interested: boolean | null; respondedBy: string | null; closed: boolean },
  siteUrl: string,
): MessagePayload {
  const by = d.respondedBy ? ` (answered by **${d.respondedBy}**)` : ''
  const status =
    d.interested === true
      ? `✅ **${d.team.name} is in**${by}.`
      : d.interested === false
        ? `**${d.team.name} is sitting this one out**${by}.`
        : '**Captain or co-captain:** answer below, or on My team on the site.'
  const footer = d.closed
    ? 'Answers are closed: the preseason pairings are made.'
    : d.interested === null
      ? ''
      : 'You can change your answer until the pairings are made.'
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: 'Preseason matches: want in?',
        url: myTeamUrl(siteUrl),
        description: [
          "Before the regular season we're running optional **preseason matches** that league casters can stream.",
          '',
          '• 1 or 2 matches, depending on how many teams sign up',
          "• No fixed time: you'll get a shared channel with each opponent and agree on a time together",
          "• Played and reported like a league match, but results don't count toward standings or stats",
          '',
          status,
          footer,
        ]
          .filter((l, i, all) => !(l === '' && i === all.length - 1))
          .join('\n'),
        ...(d.interested === true ? { color: HAL_WIN } : {}),
      }),
    ],
    components: d.closed
      ? [row(linkButton('Open My team', myTeamUrl(siteUrl)))]
      : [
          row(
            button(3, "We're in", `preseason:in:${d.team.id}`),
            button(2, 'No thanks', `preseason:out:${d.team.id}`),
            linkButton('Open My team', myTeamUrl(siteUrl)),
          ),
        ],
  }
}

/** First post in the shared channel. */
export function pairingIntro(d: { home: PsTeam; away: PsTeam }, siteUrl: string): MessagePayload {
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `Preseason: ${d.home.name} vs ${d.away.name}`,
        url: myTeamUrl(siteUrl),
        description: [
          'This channel is for the two teams to agree on a time for your preseason match.',
          '',
          '**How it works**',
          '1. Talk here and pick a time that works for both teams.',
          '2. A captain or co-captain proposes it with **/preseason** (or on My team on the site).',
          "3. The other team's captain or co-captain accepts it here or on the site.",
          '',
          `The time has to be at least 1 hour away and before the regular season starts. Each match needs ${PRESEASON_GAP_HOURS} hours to itself so it can be cast, so a time close to another match is refused.`,
          '',
          "Once it's set, it runs like a league match: reminders and check-in in your team channels, and full reporting. The result doesn't count toward standings or stats. League admins and casters can see this channel.",
        ].join('\n'),
      }),
    ],
  }
}

/** In each team's own channel, pointing to the shared one. */
export function teamPairingNotice(team: PsTeam, opponent: PsTeam, sharedChannelId: string): MessagePayload {
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `Preseason match vs ${opponent.name}`,
        description: `**${team.name}** plays **${opponent.name}** [${opponent.tag}] in the preseason. Head to <#${sharedChannelId}> to agree on a time with them.`,
      }),
    ],
  }
}

export interface ProposalView {
  id: string
  proposer: PsTeam
  other: PsTeam
  proposedAt: string
  status: ProposalStatus
  responder: string | null
  /** The match's current time when this would move it. */
  currentAt: string | null
}

export function proposalMessage(p: ProposalView, siteUrl: string): MessagePayload {
  const when = `**${discordTime(p.proposedAt)}** (${discordTime(p.proposedAt, 'R')})`
  const by = p.responder ? ` by **${p.responder}**` : ''
  const lines = [`**${p.proposer.name}** proposes ${when}.`]
  if (p.currentAt) lines.push(`Currently set for ${discordTime(p.currentAt)}.`)
  switch (p.status) {
    case 'pending':
      lines.push(`Captain or co-captain of **${p.other.name}**: accept or decline below, or on My team.`)
      break
    case 'accepted':
      lines.push(`✅ Accepted${by}. The match is set.`)
      break
    case 'declined':
      lines.push(`❌ Declined${by}. Propose another time with **/preseason**.`)
      break
    case 'cancelled':
      lines.push(`Withdrawn by ${p.proposer.name}.`)
      break
    case 'expired':
      lines.push('Expired.')
      break
  }
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `Proposed time: ${p.proposer.tag} vs ${p.other.tag}`,
        url: myTeamUrl(siteUrl),
        description: lines.join('\n'),
        ...(p.status === 'accepted' ? { color: HAL_WIN } : p.status === 'declined' ? { color: HAL_LOSS } : {}),
      }),
    ],
    components:
      p.status === 'pending'
        ? [row(button(3, 'Accept', `preseason:accept:${p.id}`), button(4, 'Decline', `preseason:decline:${p.id}`))]
        : [],
  }
}

/** Shared channel, after a time is accepted. */
export function scheduledNotice(d: { home: PsTeam; away: PsTeam; at: string; matchId: string; moved: boolean }, siteUrl: string): MessagePayload {
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: d.moved ? 'Preseason match moved' : 'Preseason match set',
        url: matchUrl(siteUrl, d.matchId),
        color: HAL_WIN,
        description: [
          `**${d.home.name}** vs **${d.away.name}** · ${discordTime(d.at)} (${discordTime(d.at, 'R')})`,
          'Reminders and check-in land in your team channels. Report it like a league match.',
          `[Match page](${matchUrl(siteUrl, d.matchId)})`,
        ].join('\n'),
      }),
    ],
  }
}

/** #admin-only, so a caster can be lined up. */
export function castingNotice(d: { home: PsTeam; away: PsTeam; at: string; matchId: string; moved: boolean }, siteUrl: string): MessagePayload {
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `${d.moved ? 'Preseason match moved' : 'Preseason match to cast'}: ${d.home.tag} vs ${d.away.tag}`,
        url: matchUrl(siteUrl, d.matchId),
        description: `${d.home.name} vs ${d.away.name} · ${discordTime(d.at)} (${discordTime(d.at, 'R')}).\nCasters can claim it on Admin → Casting.`,
      }),
    ],
  }
}

export function declinedNotice(p: ProposalView): MessagePayload {
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: 'Time declined',
        color: HAL_LOSS,
        description: `**${p.other.name}** declined ${discordTime(p.proposedAt)}. Agree on another time here, then propose it with **/preseason**.`,
      }),
    ],
  }
}

export function pairingCancelledNotice(d: { home: PsTeam; away: PsTeam }): MessagePayload {
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: 'Preseason match canceled',
        color: HAL_LOSS,
        description: `League staff canceled the preseason match **${d.home.name}** vs **${d.away.name}**.`,
      }),
    ],
  }
}

/**
 * Match-day channels: a shared channel for both teams, opened 15 minutes before a regular-season or
 * playoff match and archived (teams removed, history kept) once the match is settled. Pure
 * builders and timing rules, tested in matchday_messages_test.ts; the I/O is in matchday_flow.ts.
 */
import { perms, PERMISSIONS, type MessagePayload, type PermissionOverwrite } from './discord.ts'
import { halEmbed } from './embeds.ts'
import { discordTime } from './match_messages.ts'
import { boldText } from '../discord-sync/plan.ts'
import { weekLabel } from './match_messages.ts'

export const MATCHDAY_CATEGORY = 'Match Day'
export const ARCHIVE_CATEGORY = 'Match Archive'
/** Discord's limit on channels in one category. */
export const CATEGORY_LIMIT = 50

const MIN = 60_000
const HOUR = 60 * MIN
export const OPEN_BEFORE = 15 * MIN
/** Matches this late without a channel are skipped (the bot was down; the match is long over). */
export const OPEN_UNTIL = 6 * HOUR

/** Settled matches: the teams' access is removed. */
export const SETTLED = ['confirmed', 'forfeit', 'cancelled']

export function shouldOpen(scheduledAt: string, now: number): boolean {
  const t = new Date(scheduledAt).getTime()
  return now >= t - OPEN_BEFORE && now < t + OPEN_UNTIL
}

export interface DayTeam {
  id: string
  name: string
  tag: string
}

const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '')
    .slice(0, 12)

/** "W3-𝗡𝗠𝗚-vs-𝗢𝗪𝗟" (bold keeps the tags' capitals; P1 for playoff round 1). */
export function matchChannelName(week: number, stage: string, playoffRound: number | null, home: DayTeam, away: DayTeam): string {
  const prefix = stage === 'playoff' ? `P${playoffRound ?? 1}` : `W${week}`
  const tag = (t: DayTeam) => boldText(slug(t.tag) || 'team')
  return `${prefix}-${tag(home)}-vs-${tag(away)}`
}

const member = () =>
  perms(PERMISSIONS.VIEW_CHANNEL, PERMISSIONS.SEND_MESSAGES, PERMISSIONS.READ_MESSAGE_HISTORY, PERMISSIONS.ATTACH_FILES, PERMISSIONS.EMBED_LINKS)

/** Open: both teams, BIL Admin, BIL Caster and the bot. */
export function openOverwrites(o: {
  guildId: string
  teamRoleIds: string[]
  adminRoleId: string | null
  casterRoleId: string | null
  botUserId: string
}): PermissionOverwrite[] {
  const roles = [...o.teamRoleIds, o.adminRoleId, o.casterRoleId].filter((x): x is string => Boolean(x))
  return [
    { id: o.guildId, type: 0, deny: perms(PERMISSIONS.VIEW_CHANNEL) },
    ...[...new Set(roles)].map((id) => ({ id, type: 0 as const, allow: member() })),
    { id: o.botUserId, type: 1, allow: member() },
  ]
}

/** Archived: admins can read the history; nobody else sees it. Only the bot can still post. */
export function archivedOverwrites(o: { guildId: string; adminRoleId: string | null; botUserId: string }): PermissionOverwrite[] {
  const read = perms(PERMISSIONS.VIEW_CHANNEL, PERMISSIONS.READ_MESSAGE_HISTORY)
  return [
    { id: o.guildId, type: 0, deny: perms(PERMISSIONS.VIEW_CHANNEL) },
    ...(o.adminRoleId ? [{ id: o.adminRoleId, type: 0 as const, allow: read, deny: perms(PERMISSIONS.SEND_MESSAGES) }] : []),
    { id: o.botUserId, type: 1, allow: member() },
  ]
}

/** The first category of the family (Match Archive, Match Archive 2, …) with room, or the next name to create. */
export function pickCategory(
  base: string,
  channels: { id: string; name: string; type: number; parent_id?: string | null }[],
): { id: string | null; name: string } {
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: (\\d+))?$`, 'i')
  const family = channels
    .filter((c) => c.type === 4 && pattern.test(c.name))
    .map((c) => ({ id: c.id, n: Number(c.name.match(pattern)?.[1] ?? 1) }))
    .sort((a, b) => a.n - b.n)
  for (const cat of family) {
    const used = channels.filter((c) => c.parent_id === cat.id).length
    if (used < CATEGORY_LIMIT) return { id: cat.id, name: '' }
  }
  const next = (family.at(-1)?.n ?? 0) + 1
  return { id: null, name: next === 1 ? base : `${base} ${next}` }
}

export function matchdayIntro(
  m: { id: string; week: number; stage: string; scheduledAt: string; home: DayTeam; away: DayTeam },
  siteUrl: string,
): MessagePayload {
  const round = m.stage === 'playoff' ? 'Playoffs' : weekLabel(m.week)
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      halEmbed({
        title: `${m.home.name} vs ${m.away.name}`,
        url: `${siteUrl}/matches/${m.id}`,
        description:
          `${round} · ${discordTime(m.scheduledAt)}\n\n` +
          'This channel is for both teams to sort out lobbies, invites and anything else before and during the match. Keep it civil: admins can read it, and it is kept after the match.\n\n' +
          `• Check in from your team channel or the [match page](${siteUrl}/matches/${m.id}).\n` +
          '• Captains report the result with `/report` or on the site.\n' +
          '• Problem with the other team? Captains use `/dispute`.',
      }),
    ],
  }
}

export function archivedNotice(status: string): MessagePayload {
  const why = status === 'cancelled' ? 'The match was cancelled' : status === 'forfeit' ? 'The match ended in a forfeit' : 'The result is confirmed'
  return {
    allowed_mentions: { parse: [] },
    embeds: [halEmbed({ description: `${why}, so this channel is now archived. The teams no longer see it; admins can still read the history.` })],
  }
}

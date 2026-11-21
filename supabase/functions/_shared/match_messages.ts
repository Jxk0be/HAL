/**
 * Discord messages about matches: reminders, check-in, results, live and reschedule notices.
 * Pure builders (no I/O), unit-tested in match_messages_test.ts.
 */
import type { MessagePayload } from './discord.ts'
import { halEmbed, HAL_LOSS, HAL_WIN } from './embeds.ts'

export interface MsgTeam {
  id: string
  name: string
  tag: string
}

export interface MsgMatch {
  id: string
  week: number
  scheduledAt: string
  home: MsgTeam
  away: MsgTeam
}

/** Discord timestamp markup: shows in each reader's own time zone. */
export function discordTime(iso: string, style: 'F' | 'f' | 'R' | 't' = 'F'): string {
  return `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`
}

const matchUrl = (siteUrl: string, id: string) => `${siteUrl}/matches/${id}`
const opponentOf = (m: MsgMatch, teamId: string) => (m.home.id === teamId ? m.away : m.home)

/** Match links don't ping anyone; mentions are opted in per message. */
const NO_PINGS = { parse: [] as ('roles' | 'users' | 'everyone')[] }

export function reminderMessage(m: MsgMatch, teamId: string, hoursBefore: 24 | 1, siteUrl: string): MessagePayload {
  const opp = opponentOf(m, teamId)
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: hoursBefore === 24 ? `Match tomorrow vs ${opp.name}` : `Match in 1 hour vs ${opp.name}`,
        url: matchUrl(siteUrl, m.id),
        description: [
          `**Week ${m.week}** · ${discordTime(m.scheduledAt)} (${discordTime(m.scheduledAt, 'R')})`,
          `Opponent: **${opp.name}** [${opp.tag}]`,
          '',
          'Check-in opens 15 minutes before. Your captain or co-captain checks in 4 players here or on the site.',
          `[Match page](${matchUrl(siteUrl, m.id)})`,
        ].join('\n'),
      }),
    ],
  }
}

export const checkinButton = (matchId: string, disabled = false) => ({
  type: 1,
  components: [{ type: 2, style: 1, label: 'Check in', custom_id: `checkin:open:${matchId}`, disabled }],
})

export function checkinOpenMessage(m: MsgMatch, teamId: string, siteUrl: string): MessagePayload {
  const opp = opponentOf(m, teamId)
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `Check-in is open: vs ${opp.name}`,
        url: matchUrl(siteUrl, m.id),
        description: [
          `Match starts ${discordTime(m.scheduledAt, 'R')} (${discordTime(m.scheduledAt, 't')}).`,
          'Captain or co-captain: press **Check in** and pick your 4 players.',
          'Only players on the roster 24 hours before the match (or approved emergency subs) can play.',
        ].join('\n'),
      }),
    ],
    components: [checkinButton(m.id)],
  }
}

export function checkedInMessage(m: MsgMatch, teamId: string, players: string[], at: string, siteUrl: string): MessagePayload {
  const opp = opponentOf(m, teamId)
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `Checked in vs ${opp.name}`,
        url: matchUrl(siteUrl, m.id),
        color: HAL_WIN,
        description: `Checked in: ${players.map((p) => `**${p}**`).join(', ')}\n${discordTime(at, 'f')}`,
      }),
    ],
    components: [],
  }
}

export function missingCheckinMessage(m: MsgMatch, teamId: string, captainDiscordIds: string[], siteUrl: string): MessagePayload {
  const mentions = captainDiscordIds.map((id) => `<@${id}>`).join(' ')
  return {
    content: mentions || undefined,
    allowed_mentions: { users: captainDiscordIds },
    embeds: [
      halEmbed({
        title: 'You haven’t checked in',
        url: matchUrl(siteUrl, m.id),
        color: HAL_LOSS,
        description: [
          `Your match vs **${opponentOf(m, teamId).name}** has started and your team isn't checked in.`,
          'Check in now. Showing up 30 minutes late is a series forfeit (admins decide).',
        ].join('\n'),
      }),
    ],
  }
}

export function adminMissingCheckinMessage(m: MsgMatch, missing: MsgTeam[], siteUrl: string): MessagePayload {
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `No check-in: ${m.home.tag} vs ${m.away.tag}`,
        url: matchUrl(siteUrl, m.id),
        color: HAL_LOSS,
        description: `${missing.map((t) => `**${t.name}**`).join(' and ')} had not checked in at the start time (${discordTime(m.scheduledAt, 't')}). Forfeits are an admin decision.`,
      }),
    ],
  }
}

export interface ResultMap {
  number: number
  mode: string
  map: string
  homeScore: number | null
  awayScore: number | null
}
export interface TopPerformer {
  name: string
  team: string
  kills: number
  deaths: number
  maps: number
}

export function resultMessage(
  m: MsgMatch & { status: 'confirmed' | 'forfeit'; homeSeries: number | null; awaySeries: number | null; winnerTeamId: string | null; forfeitTeamId: string | null },
  maps: ResultMap[],
  top: TopPerformer | null,
  siteUrl: string,
): MessagePayload {
  const winner = m.winnerTeamId === m.home.id ? m.home : m.winnerTeamId === m.away.id ? m.away : null
  if (m.status === 'forfeit') {
    const loser = m.forfeitTeamId === m.home.id ? m.home : m.away
    return {
      allowed_mentions: NO_PINGS,
      embeds: [
        halEmbed({
          title: `${m.home.tag} vs ${m.away.tag} · Week ${m.week}`,
          url: matchUrl(siteUrl, m.id),
          description: `**${winner?.name ?? '?'}** wins by forfeit (${loser.name} forfeited).\n[Match page](${matchUrl(siteUrl, m.id)})`,
        }),
      ],
    }
  }
  const side = (t: MsgTeam, score: number | null) => (winner?.id === t.id ? `**${t.name} ${score ?? 0}**` : `${t.name} ${score ?? 0}`)
  const fields = maps.map((x) => ({
    name: `Map ${x.number} · ${x.mode}`,
    value: `${x.map}: ${x.homeScore ?? '–'} – ${x.awayScore ?? '–'}`,
    inline: true,
  }))
  if (top) {
    const kd = top.deaths === 0 ? top.kills.toFixed(2) : (top.kills / top.deaths).toFixed(2)
    fields.push({ name: 'Top performer', value: `**${top.name}** (${top.team}) · ${kd} K/D, ${top.kills}–${top.deaths} over ${top.maps} ${top.maps === 1 ? 'map' : 'maps'}`, inline: false })
  }
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `${m.home.tag} vs ${m.away.tag} · Week ${m.week}`,
        url: matchUrl(siteUrl, m.id),
        description: `${side(m.home, m.homeSeries)} – ${side(m.away, m.awaySeries)}\n[Match page](${matchUrl(siteUrl, m.id)})`,
        fields: fields.slice(0, 25),
      }),
    ],
  }
}

/** Best K/D among players with at least one map. */
export function topPerformer(lines: { name: string; team: string; kills: number; deaths: number; mapId: string; userId: string }[]): TopPerformer | null {
  const by = new Map<string, TopPerformer & { mapIds: Set<string> }>()
  for (const l of lines) {
    const p = by.get(l.userId) ?? { name: l.name, team: l.team, kills: 0, deaths: 0, maps: 0, mapIds: new Set<string>() }
    p.kills += l.kills
    p.deaths += l.deaths
    p.mapIds.add(l.mapId)
    p.maps = p.mapIds.size
    by.set(l.userId, p)
  }
  const kd = (p: TopPerformer) => (p.deaths === 0 ? p.kills : p.kills / p.deaths)
  const best = [...by.values()].filter((p) => p.maps >= 1).sort((a, b) => kd(b) - kd(a) || b.kills - a.kills)[0]
  return best ? { name: best.name, team: best.team, kills: best.kills, deaths: best.deaths, maps: best.maps } : null
}

export function liveMessage(m: MsgMatch, url: string, caster: string, siteUrl: string): MessagePayload {
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `Now live: ${m.home.name} vs ${m.away.name}`,
        url,
        description: `Week ${m.week}, cast by **${caster}**.\n[Watch the stream](${url}) · [Match page](${matchUrl(siteUrl, m.id)})`,
      }),
    ],
  }
}

export type RescheduleEvent = 'requested' | 'accepted' | 'declined' | 'cancelled' | 'expired'

export function rescheduleMessage(m: MsgMatch, event: RescheduleEvent, requestingTeamId: string, proposedAt: string, siteUrl: string): MessagePayload {
  const asker = requestingTeamId === m.home.id ? m.home : m.away
  const other = opponentOf(m, requestingTeamId)
  const when = discordTime(proposedAt)
  const text: Record<RescheduleEvent, string> = {
    requested: `**${asker.name}** requested a reschedule to ${when}. ${other.name} captain, respond on the site.`,
    accepted: `**${other.name}** accepted. The match is now ${when}.`,
    declined: `**${other.name}** declined the move to ${when}. The match stays at ${discordTime(m.scheduledAt)}.`,
    cancelled: `**${asker.name}** cancelled their request to move the match to ${when}.`,
    expired: `The request to move the match to ${when} expired. The match stays at ${discordTime(m.scheduledAt)}.`,
  }
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `Reschedule: ${m.home.tag} vs ${m.away.tag}`,
        url: matchUrl(siteUrl, m.id),
        description: `${text[event]}\n[Match page](${matchUrl(siteUrl, m.id)})`,
      }),
    ],
  }
}

export const rescheduleButtons = (requestId: string) => ({
  type: 1,
  components: [
    { type: 2, style: 3, label: 'Accept', custom_id: `reschedule:accept:${requestId}` },
    { type: 2, style: 4, label: 'Decline', custom_id: `reschedule:decline:${requestId}` },
  ],
})

/** The request as the opponent sees it (with Accept/Decline) or as the requester sees it. */
export function rescheduleRequestMessage(
  m: MsgMatch,
  r: { id: string; teamId: string; proposedAt: string },
  forTeamId: string,
  siteUrl: string,
): MessagePayload {
  const asker = r.teamId === m.home.id ? m.home : m.away
  const isOpponent = forTeamId !== r.teamId
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `Reschedule request: ${m.home.tag} vs ${m.away.tag}`,
        url: matchUrl(siteUrl, m.id),
        description: [
          `**${asker.name}** wants to move the week ${m.week} match to **${discordTime(r.proposedAt)}** (${discordTime(r.proposedAt, 'R')}).`,
          `Currently: ${discordTime(m.scheduledAt)}.`,
          isOpponent
            ? 'Captain or co-captain: accept or decline below (or on the site).'
            : 'Waiting for the other captain to answer. You can cancel it on the site.',
        ].join('\n'),
      }),
    ],
    components: isOpponent ? [rescheduleButtons(r.id)] : [],
  }
}

/** The request after it was answered (buttons removed). */
export function rescheduleOutcomeMessage(
  m: MsgMatch,
  r: { teamId: string; proposedAt: string; status: RescheduleEvent },
  responder: string | null,
  siteUrl: string,
): MessagePayload {
  const asker = r.teamId === m.home.id ? m.home : m.away
  const by = responder ? ` by **${responder}**` : ''
  const outcome: Record<RescheduleEvent, string> = {
    requested: 'Pending.',
    accepted: `✅ Accepted${by}. The match is now ${discordTime(r.proposedAt)}.`,
    declined: `❌ Declined${by}. The match stays at ${discordTime(m.scheduledAt)}.`,
    cancelled: `Cancelled by ${asker.name}.`,
    expired: `Expired: it wasn't answered 24 hours before the default time. The match stays at ${discordTime(m.scheduledAt)}.`,
  }
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `Reschedule request: ${m.home.tag} vs ${m.away.tag}`,
        url: matchUrl(siteUrl, m.id),
        color: r.status === 'accepted' ? HAL_WIN : r.status === 'declined' ? HAL_LOSS : undefined,
        description: `**${asker.name}** asked to move the match to ${discordTime(r.proposedAt)}.\n${outcome[r.status]}`,
      }),
    ],
    components: [],
  }
}

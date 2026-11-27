/**
 * Live board messages the scheduler keeps up to date: #team-rosters, #standings, #match-schedule,
 * #sub-board, plus the weekly #player-of-the-week post. Pure builders (no I/O), tested in
 * boards_test.ts. board_sync.ts loads the data and edits the messages only when the content changes.
 *
 * Boards never ping anyone (allowed_mentions is empty) except the Player of the Week winner.
 */
import type { MessagePayload } from './discord.ts'
import { halEmbed } from './embeds.ts'
import { discordTime } from './match_messages.ts'

const NO_PINGS = { parse: [] as ('roles' | 'users' | 'everyone')[] }

// ---- #team-rosters ---------------------------------------------------------------
export interface RosterPlayer {
  name: string
  discordId: string | null
  role: 'starter' | 'sub'
  captain: boolean
  coCaptain: boolean
}

export interface RosterTeam {
  id: string
  name: string
  tag: string
  logoUrl: string | null
  division: string | null
  players: RosterPlayer[]
}

function playerLine(p: RosterPlayer): string {
  const badge = p.captain ? ' · **Captain**' : p.coCaptain ? ' · Co-captain' : ''
  return `**${p.name}**${p.discordId ? ` <@${p.discordId}>` : ''}${badge}`
}

/** Captain first, then co-captain, then everyone else in roster order. */
function rosterOrder(players: RosterPlayer[]): RosterPlayer[] {
  const rank = (p: RosterPlayer) => (p.captain ? 0 : p.coCaptain ? 1 : 2)
  return players.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p)
}

export function rosterBoard(t: RosterTeam, siteUrl: string): MessagePayload {
  const ordered = rosterOrder(t.players)
  const starters = ordered.filter((p) => p.role === 'starter')
  const subs = ordered.filter((p) => p.role === 'sub')
  const fields = [{ name: `Starters (${starters.length})`, value: starters.map(playerLine).join('\n') || 'None yet' }]
  if (subs.length) fields.push({ name: `Subs (${subs.length})`, value: subs.map(playerLine).join('\n') })
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `[${t.tag}] ${t.name}`,
        url: `${siteUrl}/teams/${t.id}`,
        description: t.division ? `Division: **${t.division}**` : undefined,
        thumbnail: t.logoUrl ? { url: t.logoUrl } : undefined,
        fields,
      }),
    ],
  }
}

// ---- #standings -------------------------------------------------------------------
export interface StandingRow {
  rank: number
  tag: string
  name: string
  wins: number
  losses: number
  mapsWon: number
  mapsLost: number
}

const pad = (s: string | number, n: number, right = false) => {
  const str = String(s)
  const cut = str.length > n ? str.slice(0, n) : str
  return right ? cut.padStart(n) : cut.padEnd(n)
}
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

/** A monospace table (fits a phone): rank, tag, team, W-L, maps, map diff. */
export function standingsTable(rows: StandingRow[], playoffLine: number | null): string {
  const head = `${pad('#', 2, true)} ${pad('TAG', 5)} ${pad('TEAM', 14)} ${pad('W-L', 5)} ${pad('MAPS', 5)} ${pad('+/-', 4, true)}`
  const lines = [head]
  rows.forEach((r, i) => {
    lines.push(
      `${pad(r.rank, 2, true)} ${pad(r.tag, 5)} ${pad(r.name, 14)} ${pad(`${r.wins}-${r.losses}`, 5)} ${pad(`${r.mapsWon}-${r.mapsLost}`, 5)} ${pad(signed(r.mapsWon - r.mapsLost), 4, true)}`,
    )
    if (playoffLine && i === playoffLine - 1 && i < rows.length - 1) lines.push('─'.repeat(head.length))
  })
  return '```\n' + lines.join('\n') + '\n```'
}

export function standingsBoard(
  d: { divisionName: string; seasonName: string; rows: StandingRow[]; playoffTeams: number | null },
  siteUrl: string,
): MessagePayload {
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `${d.divisionName} standings`,
        url: `${siteUrl}/standings`,
        description: d.rows.length
          ? `${standingsTable(d.rows, d.playoffTeams)}${d.playoffTeams ? `Top ${d.playoffTeams} make the playoffs (line above).` : ''}`
          : 'No teams in this division yet.',
        fields: [{ name: 'Season', value: d.seasonName, inline: true }],
      }),
    ],
  }
}

// ---- #match-schedule --------------------------------------------------------------
export interface ScheduleMatch {
  id: string
  scheduledAt: string
  status: string
  home: { name: string; tag: string }
  away: { name: string; tag: string }
  homeSeries: number | null
  awaySeries: number | null
  division: string | null
}

function matchLine(m: ScheduleMatch, siteUrl: string): string {
  const vs = `**[${m.home.tag}]** ${m.home.name} vs **[${m.away.tag}]** ${m.away.name}`
  const link = `[match](${siteUrl}/matches/${m.id})`
  switch (m.status) {
    case 'confirmed':
      return `✅ ${vs} · **${m.homeSeries ?? 0}-${m.awaySeries ?? 0}** · ${link}`
    case 'forfeit':
      return `🏳️ ${vs} · forfeit · ${link}`
    case 'cancelled':
      return `~~${vs}~~ · canceled`
    case 'live':
      return `🔴 ${vs} · live now · ${link}`
    case 'awaiting_reports':
    case 'disputed':
      return `⏳ ${vs} · result pending · ${link}`
    default:
      return `${discordTime(m.scheduledAt, 'f')} · ${vs} · ${link}`
  }
}

/** One message per league week. Matches are listed by time, grouped by division when there are several. */
export function scheduleBoard(d: { seasonName: string; week: number; matches: ScheduleMatch[] }, siteUrl: string): MessagePayload {
  const sorted = [...d.matches].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  const divisions = [...new Set(sorted.map((m) => m.division ?? ''))]
  const fields =
    divisions.length > 1
      ? divisions.map((div) => ({
          name: div || 'Matches',
          value: sorted.filter((m) => (m.division ?? '') === div).map((m) => matchLine(m, siteUrl)).join('\n').slice(0, 1024),
        }))
      : undefined
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `${d.seasonName} · Week ${d.week} schedule`,
        url: `${siteUrl}/matches`,
        description: fields ? 'Times show in your own time zone.' : `${sorted.map((m) => matchLine(m, siteUrl)).join('\n').slice(0, 3900)}\n\nTimes show in your own time zone.`,
        fields,
      }),
    ],
  }
}

// ---- #sub-board -------------------------------------------------------------------
export interface SubNeed {
  matchId: string
  teamId: string
  teamName: string
  teamTag: string
  opponentName: string
  opponentTag: string
  scheduledAt: string
  needed: number
  volunteers: { userId: string; discordId: string | null; name: string }[]
}

export const subButtons = (matchId: string, teamId: string) => ({
  type: 1,
  components: [
    { type: 2, style: 3, label: "I'm available", custom_id: `subs:yes:${matchId}:${teamId}` },
    { type: 2, style: 2, label: 'Withdraw', custom_id: `subs:no:${matchId}:${teamId}` },
  ],
})

export function subBoard(n: SubNeed, siteUrl: string): MessagePayload {
  const who = n.volunteers.length
    ? n.volunteers.map((v) => `• **${v.name}**${v.discordId ? ` <@${v.discordId}>` : ''}`).join('\n')
    : 'Nobody yet.'
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      halEmbed({
        title: `[${n.teamTag}] ${n.teamName} needs ${n.needed} emergency sub${n.needed === 1 ? '' : 's'}`,
        url: `${siteUrl}/matches/${n.matchId}`,
        description: [
          `vs **[${n.opponentTag}]** ${n.opponentName} · ${discordTime(n.scheduledAt, 'f')} (${discordTime(n.scheduledAt, 'R')})`,
          '',
          "Not on a team this season? Press **I'm available**. The captain picks from the list on the match page, you accept in your DMs, then an admin approves (rule 4.3).",
        ].join('\n'),
        fields: [{ name: `Available (${n.volunteers.length})`, value: who.slice(0, 1024) }],
      }),
    ],
    components: [subButtons(n.matchId, n.teamId)],
  }
}

/** Posted in the team channel when someone volunteers (pings the captains only). */
export function volunteerNotice(n: { teamId: string; matchId: string; opponentName: string }, volunteer: string, captainIds: string[], siteUrl: string): MessagePayload {
  return {
    content: captainIds.map((id) => `<@${id}>`).join(' ') || undefined,
    allowed_mentions: { parse: [], users: captainIds },
    embeds: [
      halEmbed({
        title: `${volunteer} is available to sub`,
        url: `${siteUrl}/matches/${n.matchId}`,
        description: `They pressed **I'm available** on #sub-board for your match vs **${n.opponentName}**. [Request them on the match page](${siteUrl}/matches/${n.matchId}).`,
      }),
    ],
  }
}

// ---- #player-of-the-week ------------------------------------------------------------
export interface WeekPlayer {
  discordId: string | null
  name: string
  teamTag: string | null
  maps: number
  kills: number
  deaths: number
  kd: number
  avgScore: number
}

const statLine = (p: WeekPlayer) => `${p.kills}/${p.deaths} (**${p.kd.toFixed(2)}** K/D) · **${p.avgScore}** avg score · ${p.maps} maps`

export function potwPost(d: { weekLabel: string; players: WeekPlayer[] }, siteUrl: string): MessagePayload | null {
  const [winner, ...rest] = d.players
  if (!winner) return null
  const tag = (p: WeekPlayer) => (p.teamTag ? `[${p.teamTag}] ` : '')
  return {
    content: winner.discordId ? `Congrats <@${winner.discordId}>!` : undefined,
    allowed_mentions: { parse: [], users: winner.discordId ? [winner.discordId] : [] },
    embeds: [
      halEmbed({
        title: `Player of the Week: ${tag(winner)}${winner.name}`,
        url: `${siteUrl}/leaderboard`,
        description: `${d.weekLabel}\n${statLine(winner)}`,
        fields: rest.length
          ? [{ name: 'Honorable mentions', value: rest.map((p, i) => `${i + 2}. ${tag(p)}**${p.name}** · ${statLine(p)}`).join('\n') }]
          : undefined,
      }),
    ],
  }
}

// ---- Change detection -----------------------------------------------------------------
/** Stable hash of what the message shows (timestamps ignored, so an unchanged board is never re-sent). */
export async function boardHash(payload: MessagePayload): Promise<string> {
  const stable = JSON.stringify(payload, (k, v) => (k === 'timestamp' ? undefined : v))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

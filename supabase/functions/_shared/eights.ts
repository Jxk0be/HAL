/**
 * 8s (casual 4v4 pick-ups) messages. Pure builders, tested in eights_test.ts; the I/O is in
 * eights_flow.ts. Buttons ("feature:action:id"):
 *   eights:join / eights:leave / eights:board   queue board in #lf-8s (join is also "Queue again")
 *   eights:vote:<matchId>:<modeId>              a player votes for the mode (2 minutes)
 *   eights:cancel:<matchId>                     a player requests (or withdraws) a cancel; 5 of 8 cancels
 *   eights:won:<matchId>:<a|b>                  a player in the match reports the winner
 *   eights:fix:<matchId>:<a|b|cancel>           BIL Admin settles a disputed match
 */
import type { MessagePayload } from './discord.ts'
import { halEmbed, HAL_LOSS, HAL_WIN } from './embeds.ts'

export const QUEUE_SIZE = 8
/** Reports needed from each team, all agreeing, to confirm a match. */
export const REPORTS_PER_TEAM = 2
/** Players (of 8) who must press Request cancel to cancel a match. */
export const CANCEL_VOTES = 5

export type Team = 'a' | 'b'
export type EightsStatus = 'voting' | 'live' | 'confirmed' | 'disputed' | 'cancelled'

export interface EightsPlayer {
  userId: string
  name: string
  discordId: string | null
}

export interface EightsMatch {
  id: string
  number: number
  status: EightsStatus
  winner: Team | null
  mapName: string | null
  modeName: string | null
  teamA: EightsPlayer[]
  teamB: EightsPlayer[]
  /** Who reported which winner (for the reports count and the admin alert). */
  reports: { userId: string; team: Team; winner: Team }[]
  /** While voting: when it closes and the modes on offer with their vote counts. */
  vote?: { endsAt: string; options: VoteOption[] }
  /** How many players pressed Request cancel. */
  cancelRequests?: number
  /** Cancelled by the players' vote (true) or by an admin (false). */
  cancelledByVote?: boolean
}

export interface VoteOption {
  modeId: string
  name: string
  votes: number
}

export interface LeaderboardRow {
  name: string
  discordId: string | null
  wins: number
  losses: number
  played: number
  winPct: number
}

export const teamLabel = (t: Team) => (t === 'a' ? 'Team A' : 'Team B')
const who = (p: EightsPlayer) => (p.discordId ? `<@${p.discordId}>` : p.name)
const button = (style: 1 | 2 | 3 | 4, label: string, custom_id: string) => ({ type: 2, style, label, custom_id })
const row = (...components: unknown[]) => ({ type: 1, components })

/** The pinned queue post in #lf-8s, redrawn whenever someone joins or leaves. */
export function queueBoard(queue: EightsPlayer[]): MessagePayload {
  const list = queue.length ? queue.map((p, i) => `${i + 1}. ${who(p)}`).join('\n') : 'Nobody yet. Be the first.'
  return {
    embeds: [
      halEmbed({
        title: `8s queue · ${queue.length}/${QUEUE_SIZE}`,
        description:
          `Press **Join queue**, then hop in **🔊 8s Waiting Room**. At ${QUEUE_SIZE} players I shuffle everyone into ` +
          `Team A and Team B and move you into your team's voice channel. Then you have 2 minutes to vote for ` +
          `the mode, and I pick a random map for the winner.\n\n` +
          `After the game, press who won on the match post: ${REPORTS_PER_TEAM} players from each team need to agree. ` +
          `If the reports don't match, an admin decides. Anyone with a Blackhat account and their Activision ID on it can play. ` +
          `Queue spots expire after 2 hours.`,
        fields: [{ name: 'In the queue', value: list }],
      }),
    ],
    components: [
      row(button(3, 'Join queue', 'eights:join'), button(2, 'Leave queue', 'eights:leave'), button(2, 'Leaderboard', 'eights:board')),
    ],
    allowed_mentions: { parse: [] },
  }
}

export function reportCounts(m: EightsMatch): Record<Team, number> {
  return {
    a: m.reports.filter((r) => r.team === 'a').length,
    b: m.reports.filter((r) => r.team === 'b').length,
  }
}

function statusLine(m: EightsMatch): string {
  const line = mainStatus(m)
  const n = m.cancelRequests ?? 0
  if ((m.status === 'voting' || m.status === 'live') && n > 0) {
    return `${line}\nCancel requests: **${n}/${CANCEL_VOTES}**`
  }
  return line
}

function mainStatus(m: EightsMatch): string {
  const c = reportCounts(m)
  switch (m.status) {
    case 'voting': {
      const closes = m.vote ? `<t:${Math.floor(Date.parse(m.vote.endsAt) / 1000)}:R>` : 'soon'
      const options = m.vote?.options ?? []
      const cast = options.reduce((n, o) => n + o.votes, 0)
      return (
        `🗳️ **Vote for the mode.** Voting closes ${closes}, or as soon as all 8 have voted. Most votes wins ` +
        `(ties are random), then I pick a random map for it. You can change your vote until it closes.\n` +
        `Votes (${cast}/8): ${options.map((o) => `${o.name} **${o.votes}**`).join(' · ') || 'none yet'}`
      )
    }
    case 'live':
      return (
        `When you're done, press who won. ${REPORTS_PER_TEAM} players from each team need to report.\n` +
        `Reports: Team A ${Math.min(c.a, REPORTS_PER_TEAM)}/${REPORTS_PER_TEAM} · Team B ${Math.min(c.b, REPORTS_PER_TEAM)}/${REPORTS_PER_TEAM}`
      )
    case 'confirmed':
      return `🏆 **${teamLabel(m.winner!)} won.** It counts on the 8s leaderboard.`
    case 'disputed':
      return "The reports don't match. An admin has been pinged and will decide the result."
    case 'cancelled':
      return m.cancelledByVote
        ? `Cancelled: ${CANCEL_VOTES} players asked to cancel. It's as if it never happened. Press **Queue again** to play another.`
        : 'Cancelled by an admin. No result counts.'
  }
}

const teamField = (m: EightsMatch, t: Team) => ({
  name: `${m.winner === t ? '🏆 ' : ''}${teamLabel(t)} · 🔊 8s ${teamLabel(t)}`,
  value: (t === 'a' ? m.teamA : m.teamB).map(who).join('\n') || '—',
  inline: true,
})

/** The match post in #lf-8s. Pings the 8 players when first sent; later edits don't ping again. */
export function matchPost(m: EightsMatch): MessagePayload {
  const ids = [...m.teamA, ...m.teamB].map((p) => p.discordId).filter((x): x is string => Boolean(x))
  const setting =
    m.status === 'voting'
      ? 'Mode: voting now'
      : m.mapName && m.modeName
        ? `**${m.modeName}** on **${m.mapName}**`
        : 'Map and mode: your call'
  return {
    content: ids.length ? `8s match #${m.number} is on: ${ids.map((id) => `<@${id}>`).join(' ')}` : `8s match #${m.number} is on.`,
    embeds: [
      halEmbed({
        title: `8s match #${m.number}`,
        description: `${setting}\n\n${statusLine(m)}`,
        // Live keeps the brand red (halEmbed's default); passing color: undefined would clear it.
        ...(m.status === 'live' || m.status === 'voting' ? {} : { color: m.status === 'confirmed' ? HAL_WIN : HAL_LOSS }),
        fields: [teamField(m, 'a'), teamField(m, 'b')],
      }),
    ],
    components: matchButtons(m),
    allowed_mentions: { parse: [], users: ids },
  }
}

const cancelButton = (m: EightsMatch) =>
  button(4, `Request cancel (${m.cancelRequests ?? 0}/${CANCEL_VOTES})`, `eights:cancel:${m.id}`)

function matchButtons(m: EightsMatch): unknown[] {
  switch (m.status) {
    case 'voting':
      // Discord allows 5 buttons per row.
      return [
        row(...(m.vote?.options ?? []).slice(0, 5).map((o) => button(1, o.name, `eights:vote:${m.id}:${o.modeId}`))),
        row(cancelButton(m)),
      ]
    case 'live':
      return [row(button(1, 'Team A won', `eights:won:${m.id}:a`), button(1, 'Team B won', `eights:won:${m.id}:b`), cancelButton(m))]
    default:
      // Settled, or with an admin: everyone is free to play again.
      return [row(button(3, 'Queue again', 'eights:join'))]
  }
}

/** #admin-only alert for a disputed match, with buttons to settle it. */
export function disputeAlert(m: EightsMatch): MessagePayload {
  const all = [...m.teamA, ...m.teamB]
  const lines = m.reports.map((r) => {
    const p = all.find((x) => x.userId === r.userId)
    return `${p ? who(p) : 'A player'} (${teamLabel(r.team)}) says **${teamLabel(r.winner)} won**`
  })
  return {
    embeds: [
      halEmbed({
        title: `8s match #${m.number}: reports don't match`,
        description: `Pick the winner, or cancel the match so no result counts.\n\n${lines.join('\n') || 'No reports.'}`,
        color: HAL_LOSS,
        fields: [teamField(m, 'a'), teamField(m, 'b')],
      }),
    ],
    components: [
      row(
        button(1, 'Team A won', `eights:fix:${m.id}:a`),
        button(1, 'Team B won', `eights:fix:${m.id}:b`),
        button(4, 'Cancel match', `eights:fix:${m.id}:cancel`),
      ),
    ],
  }
}

/** The admin alert after it's settled (buttons removed). */
export function resolvedAlert(m: EightsMatch, adminName: string): MessagePayload {
  const outcome = m.status === 'cancelled' ? 'cancelled the match' : `decided **${teamLabel(m.winner!)} won**`
  return {
    embeds: [
      halEmbed({
        title: `8s match #${m.number}: settled`,
        description: `${adminName} ${outcome}.`,
        color: HAL_WIN,
        fields: [teamField(m, 'a'), teamField(m, 'b')],
      }),
    ],
    components: [],
  }
}

export function leaderboardEmbed(rows: LeaderboardRow[]): MessagePayload {
  const medal = ['🥇', '🥈', '🥉']
  const lines = rows.map(
    (r, i) => `${medal[i] ?? `**${i + 1}.**`} ${r.name} · **${r.wins}W** ${r.losses}L · ${r.winPct}%`,
  )
  return {
    embeds: [
      halEmbed({
        title: '8s leaderboard',
        description: lines.length
          ? `Most wins first, then win %. Only confirmed matches count.\n\n${lines.join('\n')}`
          : 'No confirmed 8s matches yet.',
      }),
    ],
    allowed_mentions: { parse: [] },
  }
}

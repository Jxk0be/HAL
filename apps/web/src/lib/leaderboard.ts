/**
 * Player leaderboard helpers. Rows come from the season_leaderboard() database function: every
 * player with confirmed stats, a confirmed check-in, or an admin "incomplete data" flag.
 * There is no minimum-maps rule: every player is ranked on what they've played.
 */
export interface LeaderboardRow extends Record<string, unknown> {
  user_id: string
  activision_id: string | null
  avatar_url: string | null
  /** Current team this season; null = free agent. */
  team_id: string | null
  team_name: string | null
  team_tag: string | null
  maps_played: number
  kills: number
  deaths: number
  /** Kills per death (kills when deaths are 0); null with no maps played. */
  kd: number | null
  plus_minus: number
  avg_score: number | null
  incomplete: boolean
  incomplete_reason: string | null
}

export type LeaderboardKey = 'kd' | 'kills' | 'avg_score'

/** "all", "free" (free agents) or a team id. */
export type LeaderboardTeamFilter = string

export function filterRows(rows: readonly LeaderboardRow[], opts: { team: LeaderboardTeamFilter; search: string }): LeaderboardRow[] {
  const q = opts.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (opts.team === 'free' && r.team_id) return false
    if (opts.team !== 'all' && opts.team !== 'free' && r.team_id !== opts.team) return false
    if (q && !(r.activision_id ?? '').toLowerCase().includes(q)) return false
    return true
  })
}

/** Top players for one stat (players without a value are left out). */
export function topBy(rows: readonly LeaderboardRow[], key: LeaderboardKey, limit: number): LeaderboardRow[] {
  return rows
    .filter((r) => r.maps_played > 0 && r[key] != null)
    .sort((a, b) => (b[key] as number) - (a[key] as number) || b.kills - a.kills)
    .slice(0, limit)
}

/** Teams that appear on the board, for the filter (sorted by tag). */
export function boardTeams(rows: readonly LeaderboardRow[]): { id: string; tag: string; name: string }[] {
  const seen = new Map<string, { id: string; tag: string; name: string }>()
  for (const r of rows) {
    if (r.team_id && !seen.has(r.team_id)) seen.set(r.team_id, { id: r.team_id, tag: r.team_tag ?? '', name: r.team_name ?? '' })
  }
  return [...seen.values()].sort((a, b) => a.tag.localeCompare(b.tag))
}

export const formatKd = (kd: number | null) => (kd == null ? '—' : kd.toFixed(2))
export const formatPlusMinus = (n: number) => (n > 0 ? `+${n}` : String(n))

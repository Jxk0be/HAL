/**
 * Match report form logic. Pure functions, no I/O. The database (submit_report) re-checks all of
 * this; these give captains the same answers before they press Submit.
 */

export const PLAYERS_PER_SIDE = 4
export const MAX_SCREENSHOTS = 6
export const LIMITS = { kills: 500, deaths: 500, score: 100_000, mapScore: 100_000 } as const

export type StatField = 'kills' | 'deaths' | 'score'
export const STAT_FIELDS: readonly StatField[] = ['kills', 'deaths', 'score']

export interface PlayerRow {
  userId: string
  teamId: string
  kills: number | null
  deaths: number | null
  score: number | null
}

export interface ReportMap {
  modeId: string
  mapId: string
  homeScore: number | null
  awayScore: number | null
  /** Uploaded storage paths. */
  screenshots: string[]
  /** PLAYERS_PER_SIDE home rows, then PLAYERS_PER_SIDE away rows. */
  players: PlayerRow[]
}

export interface Sides {
  homeTeamId: string
  awayTeamId: string
}

export function emptyRows(sides: Sides, home: string[] = [], away: string[] = []): PlayerRow[] {
  const row = (teamId: string, userId = ''): PlayerRow => ({ userId, teamId, kills: null, deaths: null, score: null })
  return [
    ...Array.from({ length: PLAYERS_PER_SIDE }, (_, i) => row(sides.homeTeamId, home[i])),
    ...Array.from({ length: PLAYERS_PER_SIDE }, (_, i) => row(sides.awayTeamId, away[i])),
  ]
}

export function emptyMap(sides: Sides, home: string[] = [], away: string[] = [], prev?: ReportMap): ReportMap {
  return {
    modeId: '',
    mapId: '',
    homeScore: null,
    awayScore: null,
    screenshots: [],
    // Same lineup as the previous map is the usual case.
    players: prev
      ? prev.players.map((p) => ({ userId: p.userId, teamId: p.teamId, kills: null, deaths: null, score: null }))
      : emptyRows(sides, home, away),
  }
}

export interface SeriesState {
  home: number
  away: number
  /** Index of the map that decided the series (someone reached 3), or -1. */
  decidedAt: number
  finished: boolean
}

/** Series score from the maps whose scores are filled in (ties and blanks count for nobody). */
export function seriesState(maps: Pick<ReportMap, 'homeScore' | 'awayScore'>[]): SeriesState {
  let home = 0
  let away = 0
  let decidedAt = -1
  maps.forEach((m, i) => {
    if (m.homeScore == null || m.awayScore == null || m.homeScore === m.awayScore) return
    if (m.homeScore > m.awayScore) home++
    else away++
    if (decidedAt < 0 && (home === 3 || away === 3)) decidedAt = i
  })
  return { home, away, decidedAt, finished: decidedAt >= 0 }
}

/** How many map cards the form should show: at least 3, one more while undecided, max 5. */
export function mapsNeeded(maps: Pick<ReportMap, 'homeScore' | 'awayScore'>[]): number {
  const s = seriesState(maps)
  if (s.finished) return Math.max(3, s.decidedAt + 1)
  const played = maps.filter((m) => m.homeScore != null && m.awayScore != null).length
  return Math.min(5, Math.max(3, played + 1))
}

export function kd(kills: number | null, deaths: number | null): string {
  if (kills == null || deaths == null) return '—'
  return deaths === 0 ? kills.toFixed(2) : (kills / deaths).toFixed(2)
}

/** Whole number from user input ('' -> null); rejects anything that isn't digits. */
export function parseStat(raw: string): number | null | undefined {
  const s = raw.trim().replace(/[,\s]/g, '')
  if (s === '') return null
  if (!/^\d+$/.test(s)) return undefined
  return Number(s)
}

/**
 * Splits a pasted spreadsheet row (tabs, commas or spaces) into numbers. Returns null when any
 * cell isn't a whole number, so a bad paste changes nothing.
 */
export function parsePastedRow(text: string): number[] | null {
  // Spreadsheets copy cells with tabs (and may keep "3,400" thousands commas inside a cell).
  const trimmed = text.trim()
  const cells = (trimmed.includes('\t') ? trimmed.split('\t') : trimmed.split(/[\s,;]+/)).filter((c) => c.trim() !== '')
  if (!cells.length) return null
  const nums = cells.map((c) => parseStat(c))
  return nums.every((n): n is number => typeof n === 'number') ? nums : null
}

/** Storage path for a screenshot: matches/{match}/{team}/map{n}-{i}.webp (n is 1-based). */
export function screenshotPath(matchId: string, teamId: string, mapNumber: number, index: number | string, ext = 'webp'): string {
  return `matches/${matchId}/${teamId}/map${mapNumber}-${index}.${ext}`
}

export interface ReportIssue {
  /** 0-based map index, or -1 for the whole series. */
  map: number
  message: string
}

/** Everything that would stop submit_report from accepting the report. */
export function validateReport(maps: ReportMap[], sides: Sides): ReportIssue[] {
  const issues: ReportIssue[] = []
  if (maps.length < 3 || maps.length > 5) issues.push({ map: -1, message: 'A series is 3 to 5 maps.' })
  const s = seriesState(maps)
  if (!s.finished) issues.push({ map: -1, message: 'The series isn’t finished: one team needs 3 map wins.' })
  if (s.finished && s.decidedAt < maps.length - 1) {
    issues.push({ map: s.decidedAt + 1, message: 'This map was played after the series was decided. Remove it.' })
  }

  maps.forEach((m, i) => {
    const add = (message: string) => issues.push({ map: i, message })
    if (!m.modeId) add('Choose a mode.')
    if (!m.mapId) add('Choose a map.')
    if (m.homeScore == null || m.awayScore == null) add('Enter both scores.')
    else if (m.homeScore === m.awayScore) add('A map can’t end in a tie.')
    if (!m.screenshots.length) add('Add at least one scoreboard screenshot.')
    if (m.screenshots.length > MAX_SCREENSHOTS) add(`At most ${MAX_SCREENSHOTS} screenshots.`)

    const chosen = m.players.filter((p) => p.userId)
    if (chosen.length < PLAYERS_PER_SIDE * 2) add('Choose all 8 players.')
    if (new Set(chosen.map((p) => p.userId)).size !== chosen.length) add('A player is listed twice.')
    for (const side of [sides.homeTeamId, sides.awayTeamId]) {
      if (m.players.filter((p) => p.teamId === side).length !== PLAYERS_PER_SIDE) add('Each team needs 4 rows.')
    }
    if (m.players.some((p) => STAT_FIELDS.some((f) => p[f] == null))) add('Fill in kills, deaths and score for every player.')
    if (m.players.some((p) => (p.kills ?? 0) > LIMITS.kills || (p.deaths ?? 0) > LIMITS.deaths || (p.score ?? 0) > LIMITS.score)) {
      add('A stat is too large. Check for typos.')
    }
  })
  return issues
}

/** The JSON submit_report expects. Call only after validateReport returns no issues. */
export function toPayload(maps: ReportMap[]) {
  return {
    maps: maps.map((m, i) => ({
      number: i + 1,
      mode_id: m.modeId,
      map_id: m.mapId,
      home_score: m.homeScore,
      away_score: m.awayScore,
      screenshots: m.screenshots,
      players: m.players.map((p) => ({
        user_id: p.userId,
        team_id: p.teamId,
        kills: p.kills,
        deaths: p.deaths,
        score: p.score,
      })),
    })),
  }
}

/** Turns a stored report_submissions row back into form state (for resubmitting). */
export function fromSubmission(
  row: {
    maps: unknown
    player_stats: unknown
    screenshot_paths: string[]
  },
  sides: Sides,
): ReportMap[] {
  const maps = (Array.isArray(row.maps) ? row.maps : []) as {
    number: number
    mode_id: string
    map_id: string
    home_score: number
    away_score: number
  }[]
  const stats = (Array.isArray(row.player_stats) ? row.player_stats : []) as {
    number: number
    players: { user_id: string; team_id: string; kills: number; deaths: number; score: number }[]
  }[]
  return maps.map((m) => {
    const lines = stats.find((s) => s.number === m.number)?.players ?? []
    const side = (teamId: string) =>
      lines
        .filter((p) => p.team_id === teamId)
        .slice(0, PLAYERS_PER_SIDE)
        .map((p): PlayerRow => ({ userId: p.user_id, teamId: p.team_id, kills: p.kills, deaths: p.deaths, score: p.score }))
    const pad = (rows: PlayerRow[], teamId: string) => [
      ...rows,
      ...Array.from({ length: PLAYERS_PER_SIDE - rows.length }, () => ({ userId: '', teamId, kills: null, deaths: null, score: null })),
    ]
    return {
      modeId: m.mode_id,
      mapId: m.map_id,
      homeScore: m.home_score,
      awayScore: m.away_score,
      screenshots: row.screenshot_paths.filter((p) => p.includes(`/map${m.number}-`)),
      players: [...pad(side(sides.homeTeamId), sides.homeTeamId), ...pad(side(sides.awayTeamId), sides.awayTeamId)],
    }
  })
}

export type MismatchField = 'played' | 'mode' | 'map' | 'home_score' | 'away_score' | 'team' | 'kills' | 'deaths' | 'score'

const FIELD_LABELS: Record<string, string> = {
  played: 'whether it was played',
  mode: 'mode',
  map: 'map',
  home_score: 'home score',
  away_score: 'away score',
  team: 'team',
  kills: 'kills',
  deaths: 'deaths',
  score: 'score',
}

export interface MismatchSummary {
  map_number: number
  kind: 'map_score' | 'player_stat'
  field: string
  player: string | null
  resolved: boolean
}

/** "Map 2: Jake's kills" style lines for captains (never the values). */
export function describeMismatch(m: MismatchSummary): string {
  const field = FIELD_LABELS[m.field] ?? m.field
  if (m.kind === 'player_stat') {
    return m.field === 'played'
      ? `Map ${m.map_number}: whether ${m.player ?? 'a player'} played`
      : `Map ${m.map_number}: ${m.player ?? 'a player'}’s ${field}`
  }
  return `Map ${m.map_number}: ${field}`
}

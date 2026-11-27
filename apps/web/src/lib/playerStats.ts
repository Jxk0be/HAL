/**
 * The player page's stats breakdown (public.player_breakdown): career totals, week-by-week trend,
 * modes, maps, best match. Aggregation happens in Postgres; these helpers only format.
 */
export interface StatLine {
  maps: number
  kills: number
  deaths: number
  avg_score: number
}
export interface WeekLine extends StatLine {
  week: number
}
export interface NamedLine extends StatLine {
  name: string
  wins: number
}
export interface Breakdown {
  career: StatLine & { map_wins: number; matches: number; wins: number; losses: number; mvps: number; seasons: number }
  weeks: WeekLine[]
  modes: NamedLine[]
  maps: NamedLine[]
  best_match: {
    match_id: string
    kills: number
    deaths: number
    score: number
    maps: number
    won: boolean | null
    scheduled_at: string
    opponent: string | null
  } | null
}

export const EMPTY_BREAKDOWN: Breakdown = {
  career: { maps: 0, kills: 0, deaths: 0, avg_score: 0, map_wins: 0, matches: 0, wins: 0, losses: 0, mvps: 0, seasons: 0 },
  weeks: [],
  modes: [],
  maps: [],
  best_match: null,
}

/** K/D to two decimals; deaths of 0 count as 1 (so 12–0 is 12.00). */
export const kd = (kills: number, deaths: number): number => Math.round((kills / Math.max(deaths, 1)) * 100) / 100
export const formatKd = (kills: number, deaths: number) => (kills + deaths === 0 ? '—' : kd(kills, deaths).toFixed(2))

/** "67%" or "—". */
export const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—')

/** The best and worst map or mode by K/D, among those played at least `min` times. */
export function bestBy(lines: NamedLine[], min = 2): NamedLine | null {
  const played = lines.filter((l) => l.maps >= min)
  return played.reduce<NamedLine | null>((best, l) => (!best || kd(l.kills, l.deaths) > kd(best.kills, best.deaths) ? l : best), null)
}

export interface TrendPoint {
  x: number
  y: number
  week: number
  value: number
}

/**
 * Points for a K/D-per-week line inside a width × height box (with padding). The y-axis starts at
 * 0 and tops out at the larger of 2.0 and the best week, so 1.0 sits in a steady place.
 */
export function trendPoints(weeks: WeekLine[], width: number, height: number, pad = 8): { points: TrendPoint[]; max: number } {
  const values = weeks.map((w) => ({ week: w.week, value: kd(w.kills, w.deaths) }))
  const max = Math.max(2, ...values.map((v) => Math.ceil(v.value * 2) / 2))
  const span = Math.max(values.length - 1, 1)
  const points = values.map((v, i) => ({
    week: v.week,
    value: v.value,
    x: values.length === 1 ? width / 2 : pad + (i / span) * (width - pad * 2),
    y: pad + (1 - v.value / max) * (height - pad * 2),
  }))
  return { points, max }
}

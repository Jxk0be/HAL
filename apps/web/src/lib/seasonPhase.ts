/**
 * Where a season is (signups, preseason, week N, playoffs, complete) and what's next. Pure, so the
 * dashboard, the season hub and the matches page agree. League dates follow the season time zone.
 */
import { LEAGUE_TZ, NIGHTS, addDays, mondayOf, toZoned, zonedToUtc } from './time'

export type SeasonStatus = 'draft' | 'signups' | 'regular' | 'playoffs' | 'complete'

export interface PhaseSeason {
  status: SeasonStatus | string
  starts_on: string | null
  regular_weeks: number
  timezone?: string | null
  roster_lock_at?: string | null
  match_nights?: readonly string[] | null
  match_time?: string | null
  playoff_teams?: number | null
}

export interface SeasonStep {
  key: string
  label: string
}

/** Key for week N of the regular season. */
export const weekKey = (n: number) => `week-${n}`

/** The steps shown in season progress bars. Preseason appears only when the season has one. */
export function seasonSteps(season: Pick<PhaseSeason, 'regular_weeks'>, hasPreseason = false): SeasonStep[] {
  const weeks = Array.from({ length: Math.max(0, season.regular_weeks) }, (_, i) => ({
    key: weekKey(i + 1),
    label: `Week ${i + 1}`,
  }))
  return [
    { key: 'signups', label: 'Signups' },
    ...(hasPreseason ? [{ key: 'preseason', label: 'Preseason' }] : []),
    ...weeks,
    { key: 'playoffs', label: 'Playoffs' },
    { key: 'complete', label: 'Completed' },
  ]
}

/** Monday (YYYY-MM-DD) of week 1: the Monday of the week holding starts_on. */
export function weekOneMonday(season: Pick<PhaseSeason, 'starts_on'>): string | null {
  return season.starts_on ? mondayOf(season.starts_on) : null
}

/** Regular-season week (1-based, unclamped) holding `now`, or null without a start date. */
export function weekAt(season: Pick<PhaseSeason, 'starts_on' | 'timezone'>, now: Date): number | null {
  const monday = weekOneMonday(season)
  if (!monday) return null
  const today = toZoned(now.toISOString(), season.timezone ?? LEAGUE_TZ).date
  const days = Math.round(
    (Date.parse(`${mondayOf(today)}T00:00:00Z`) - Date.parse(`${monday}T00:00:00Z`)) / 86_400_000,
  )
  return Math.floor(days / 7) + 1
}

/** The current step key (one of seasonSteps' keys, or 'draft'). */
export function getSeasonPhase(season: PhaseSeason, now: Date = new Date(), hasPreseason = false): string {
  switch (season.status) {
    case 'draft':
      return 'draft'
    case 'signups':
      return hasPreseason ? 'preseason' : 'signups'
    case 'regular': {
      const w = weekAt(season, now) ?? 1
      return weekKey(Math.min(Math.max(w, 1), Math.max(season.regular_weeks, 1)))
    }
    case 'playoffs':
      return 'playoffs'
    default:
      return 'complete'
  }
}

/** Short human label for a phase key. */
export function phaseLabel(key: string): string {
  if (key.startsWith('week-')) return `Week ${key.slice(5)}`
  return (
    { draft: 'Not started', signups: 'Signups', preseason: 'Preseason', playoffs: 'Playoffs', complete: 'Completed' }[
      key
    ] ?? key
  )
}

export interface Milestone {
  label: string
  at: Date
}

/** Match nights of one league week (Monday `monday`), as instants, in order. */
function nightsOfWeek(season: PhaseSeason, monday: string): Date[] {
  const tz = season.timezone ?? LEAGUE_TZ
  const time = (season.match_time ?? '21:00').slice(0, 5)
  return (season.match_nights ?? ['tue', 'thu'])
    .map((n) => NIGHTS.indexOf(n as (typeof NIGHTS)[number]))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)
    .map((i) => zonedToUtc(addDays(monday, i), time, tz))
}

/**
 * The next dated thing to count down to: season start, roster lock, the next match night or the
 * start of playoffs. Null when nothing is scheduled.
 */
export function nextMilestone(season: PhaseSeason, now: Date = new Date()): Milestone | null {
  const tz = season.timezone ?? LEAGUE_TZ
  const monday = weekOneMonday(season)
  const candidates: Milestone[] = []

  if (monday && (season.status === 'signups' || season.status === 'draft')) {
    const first = nightsOfWeek(season, monday)[0]
    if (first) candidates.push({ label: 'Season starts', at: first })
  }
  if (season.roster_lock_at && season.status !== 'complete') {
    candidates.push({ label: 'Roster lock', at: new Date(season.roster_lock_at) })
  }
  if (monday && season.status === 'regular') {
    const w = weekAt(season, now) ?? 1
    for (const week of [w, w + 1]) {
      if (week < 1 || week > season.regular_weeks) continue
      nightsOfWeek(season, addDays(monday, (week - 1) * 7)).forEach((at, i) =>
        candidates.push({ label: `Week ${week} · match night ${i + 1}`, at }),
      )
    }
    candidates.push({
      label: 'Playoffs',
      at: zonedToUtc(addDays(monday, season.regular_weeks * 7), '00:00', tz),
    })
  }
  return candidates.filter((c) => c.at.getTime() > now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime())[0] ?? null
}

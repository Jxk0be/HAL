/**
 * Preseason helpers. Preseason matches are real matches with stage 'preseason' and week 0; the
 * rules themselves live in the preseason_* database functions, mirrored here only to warn early.
 */

/** "Week 3" ("Wk 3" short), or "Preseason" ("Pre" short) for week 0. */
export function weekLabel(week: number, short = false): string {
  if (week === 0) return short ? 'Pre' : 'Preseason'
  return short ? `Wk ${week}` : `Week ${week}`
}

/** Hours each match needs to itself (preseason_conflict in the database). */
export const PRESEASON_GAP_HOURS = 2

/** Matches a team plays when `n` teams say yes: a circle, so 2 each (1 when only 2 teams). */
export function preseasonMatchCount(n: number): number {
  if (n < 2) return 0
  return n === 2 ? 1 : n
}

/**
 * Why a proposed time would be refused, or null. Mirrors preseason_propose_as: at least 1 hour
 * from now, before the regular season starts, and not within 2 hours of another match.
 */
export function preseasonTimeProblem(
  at: Date,
  opts: { now?: Date; seasonStartsAt?: Date | null; otherMatches?: { scheduledAt: string; label: string }[] } = {},
): string | null {
  const now = opts.now ?? new Date()
  if (at.getTime() < now.getTime() + 60 * 60_000) return 'Pick a time at least 1 hour from now.'
  if (opts.seasonStartsAt && at.getTime() >= opts.seasonStartsAt.getTime()) {
    return 'Preseason matches have to be played before the regular season starts.'
  }
  const gap = PRESEASON_GAP_HOURS * 3600_000
  const clash = (opts.otherMatches ?? []).find((m) => Math.abs(new Date(m.scheduledAt).getTime() - at.getTime()) < gap)
  if (clash) return `Too close to ${clash.label}. Each match needs ${PRESEASON_GAP_HOURS} hours to itself so it can be cast.`
  return null
}

/**
 * Reschedule rules (rulebook: agree 24h before the default time, play in the same league week).
 * Mirrors request_reschedule() / reschedule_requests_guard() so the form can explain problems
 * before submitting; the database is the real check.
 */
import { leagueWeekBounds, LEAGUE_TZ } from './time'

export const RESCHEDULE_CUTOFF_MS = 24 * 3600_000

/** True while a reschedule can still be requested or accepted. */
export function canReschedule(defaultAt: string, now = Date.now()): boolean {
  return now <= new Date(defaultAt).getTime() - RESCHEDULE_CUTOFF_MS
}

/** Problem with a proposed time, or null when it is allowed. */
export function rescheduleProblem(
  proposed: Date,
  match: { defaultAt: string; scheduledAt: string },
  tz: string = LEAGUE_TZ,
  now = Date.now(),
): string | null {
  if (Number.isNaN(proposed.getTime())) return 'Choose a date and time.'
  if (!canReschedule(match.defaultAt, now)) return 'Too late: reschedules must be agreed 24 hours before the default time.'
  if (proposed.getTime() <= now) return 'The new time must be in the future.'
  const { start, end } = leagueWeekBounds(match.defaultAt, tz)
  if (proposed < start || proposed >= end) return 'The new time must be in the same league week, by Sunday 11:59 PM ET.'
  if (proposed.getTime() === new Date(match.scheduledAt).getTime()) return 'That is already the match time.'
  return null
}

export const DISPUTE_CATEGORIES = [
  { value: 'score', label: 'Score' },
  { value: 'stats', label: 'Player stats' },
  { value: 'conduct', label: 'Conduct' },
  { value: 'cheating', label: 'Cheating' },
  { value: 'eligibility', label: 'Eligibility' },
  { value: 'other', label: 'Other' },
] as const
export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number]['value']

/** Disputes can be opened from the match time until 24h after it (or after confirmation, if later). */
export function disputeWindow(match: { scheduledAt: string; confirmedAt?: string | null }): { opens: Date; closes: Date } {
  const opens = new Date(match.scheduledAt)
  const base = Math.max(opens.getTime(), match.confirmedAt ? new Date(match.confirmedAt).getTime() : 0)
  return { opens, closes: new Date(base + 24 * 3600_000) }
}

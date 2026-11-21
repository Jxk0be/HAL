import { describe, expect, it } from 'vitest'
import { canReschedule, disputeWindow, rescheduleProblem } from '../reschedule'
import { leagueWeekBounds, zonedToUtc } from '../time'

// Wednesday 9 PM ET in a known week (Mon Mar 8 – Sun Mar 14, 2027; DST starts Mar 14).
const defaultAt = zonedToUtc('2027-03-10', '21:00').toISOString()
const match = { defaultAt, scheduledAt: defaultAt }
const now = zonedToUtc('2027-03-07', '12:00').getTime()

describe('leagueWeekBounds', () => {
  it('runs Monday 00:00 to the next Monday 00:00 Eastern, across DST', () => {
    const { start, end } = leagueWeekBounds(defaultAt)
    expect(start.toISOString()).toBe(zonedToUtc('2027-03-08', '00:00').toISOString())
    expect(end.toISOString()).toBe(zonedToUtc('2027-03-15', '00:00').toISOString())
    expect((end.getTime() - start.getTime()) / 3600_000).toBe(167) // one hour lost to DST
  })
})

describe('rescheduleProblem', () => {
  it('allows a time later in the same week', () => {
    expect(rescheduleProblem(zonedToUtc('2027-03-14', '23:30'), match, undefined, now)).toBeNull()
  })
  it('rejects the following week', () => {
    expect(rescheduleProblem(zonedToUtc('2027-03-15', '00:30'), match, undefined, now)).toMatch(/same league week/)
  })
  it('rejects requests within 24 hours of the default time', () => {
    const late = zonedToUtc('2027-03-09', '22:00').getTime()
    expect(canReschedule(defaultAt, late)).toBe(false)
    expect(rescheduleProblem(zonedToUtc('2027-03-11', '21:00'), match, undefined, late)).toMatch(/24 hours/)
  })
  it('rejects the past and the current time', () => {
    expect(rescheduleProblem(new Date(now - 1000), match, undefined, now)).toMatch(/future/)
    expect(rescheduleProblem(new Date(defaultAt), match, undefined, now)).toMatch(/already the match time/)
  })
})

describe('disputeWindow', () => {
  it('closes 24h after the match, or after confirmation if later', () => {
    expect(disputeWindow({ scheduledAt: defaultAt }).closes.getTime() - new Date(defaultAt).getTime()).toBe(24 * 3600_000)
    const confirmedAt = new Date(new Date(defaultAt).getTime() + 5 * 3600_000).toISOString()
    expect(disputeWindow({ scheduledAt: defaultAt, confirmedAt }).closes.toISOString()).toBe(
      new Date(new Date(confirmedAt).getTime() + 24 * 3600_000).toISOString(),
    )
  })
})

import { describe, expect, it } from 'vitest'
import { getSeasonPhase, nextMilestone, phaseLabel, seasonSteps, weekAt } from '../seasonPhase'

// Starts Wednesday Jan 7 2026 → week 1 is Mon Jan 5.
const base = {
  status: 'regular',
  starts_on: '2026-01-07',
  regular_weeks: 8,
  timezone: 'America/New_York',
  match_nights: ['tue', 'thu'],
  match_time: '21:00:00',
}

describe('seasonSteps', () => {
  it('lists signups, weeks, playoffs and completed', () => {
    const keys = seasonSteps({ regular_weeks: 2 }).map((s) => s.key)
    expect(keys).toEqual(['signups', 'week-1', 'week-2', 'playoffs', 'complete'])
  })
  it('adds preseason only when there is one', () => {
    expect(seasonSteps({ regular_weeks: 1 }, true).map((s) => s.key)).toContain('preseason')
  })
})

describe('weekAt', () => {
  it('counts Monday-to-Sunday weeks in the league zone', () => {
    expect(weekAt(base, new Date('2026-01-05T05:00:00Z'))).toBe(1) // Mon 00:00 ET
    expect(weekAt(base, new Date('2026-01-12T04:59:00Z'))).toBe(1) // Sun 23:59 ET
    expect(weekAt(base, new Date('2026-01-12T05:00:00Z'))).toBe(2) // Mon 00:00 ET
  })
  it('stays right across the March DST change', () => {
    const s = { ...base, starts_on: '2026-03-02' } // week 1 = Mar 2, DST starts Mar 8
    expect(weekAt(s, new Date('2026-03-09T03:59:00Z'))).toBe(1) // Sun Mar 8 23:59 EDT
    expect(weekAt(s, new Date('2026-03-09T04:00:00Z'))).toBe(2) // Mon Mar 9 00:00 EDT
  })
})

describe('getSeasonPhase', () => {
  it('maps statuses to steps', () => {
    expect(getSeasonPhase({ ...base, status: 'signups' })).toBe('signups')
    expect(getSeasonPhase({ ...base, status: 'signups' }, new Date(), true)).toBe('preseason')
    expect(getSeasonPhase({ ...base, status: 'playoffs' })).toBe('playoffs')
    expect(getSeasonPhase({ ...base, status: 'complete' })).toBe('complete')
    expect(getSeasonPhase({ ...base, status: 'draft' })).toBe('draft')
  })
  it('clamps the regular-season week', () => {
    expect(getSeasonPhase(base, new Date('2026-01-20T12:00:00Z'))).toBe('week-3')
    expect(getSeasonPhase(base, new Date('2025-12-30T12:00:00Z'))).toBe('week-1')
    expect(getSeasonPhase(base, new Date('2026-06-01T12:00:00Z'))).toBe('week-8')
  })
  it('labels', () => {
    expect(phaseLabel('week-4')).toBe('Week 4')
    expect(phaseLabel('signups')).toBe('Signups')
  })
})

describe('nextMilestone', () => {
  it('counts to the next match night at 9 PM Eastern', () => {
    const m = nextMilestone(base, new Date('2026-01-13T12:00:00Z')) // Tue Jan 13, morning
    expect(m?.label).toBe('Week 2 · match night 1')
    expect(m?.at.toISOString()).toBe('2026-01-14T02:00:00.000Z') // 9 PM EST
  })
  it('uses daylight time after the switch', () => {
    const s = { ...base, starts_on: '2026-03-09' }
    const m = nextMilestone(s, new Date('2026-03-09T12:00:00Z'))
    expect(m?.at.toISOString()).toBe('2026-03-11T01:00:00.000Z') // 9 PM EDT
  })
  it('counts to the season start during signups', () => {
    const m = nextMilestone({ ...base, status: 'signups' }, new Date('2025-12-20T00:00:00Z'))
    expect(m?.label).toBe('Season starts')
  })
  it('prefers an earlier roster lock', () => {
    const m = nextMilestone(
      { ...base, roster_lock_at: '2026-01-13T15:00:00Z' },
      new Date('2026-01-13T12:00:00Z'),
    )
    expect(m?.label).toBe('Roster lock')
  })
  it('is null when nothing is ahead', () => {
    expect(nextMilestone({ ...base, status: 'complete' }, new Date('2026-06-01T00:00:00Z'))).toBeNull()
  })
})

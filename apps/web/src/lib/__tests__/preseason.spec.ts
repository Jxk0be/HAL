import { describe, expect, it } from 'vitest'
import { preseasonMatchCount, preseasonTimeProblem, weekLabel } from '@/lib/preseason'

const now = new Date('2026-12-01T20:00:00Z')
const hours = (h: number) => new Date(now.getTime() + h * 3600_000)

describe('preseason helpers', () => {
  it('labels week 0 as Preseason', () => {
    expect(weekLabel(0)).toBe('Preseason')
    expect(weekLabel(0, true)).toBe('Pre')
    expect(weekLabel(4)).toBe('Week 4')
    expect(weekLabel(4, true)).toBe('Wk 4')
  })

  it('pairs teams in a circle: 2 matches each, 1 for two teams', () => {
    expect(preseasonMatchCount(1)).toBe(0)
    expect(preseasonMatchCount(2)).toBe(1)
    expect(preseasonMatchCount(3)).toBe(3)
    expect(preseasonMatchCount(7)).toBe(7)
  })

  it('needs at least an hour of notice', () => {
    expect(preseasonTimeProblem(hours(0.5), { now })).toMatch(/1 hour/)
    expect(preseasonTimeProblem(hours(1), { now })).toBeNull()
  })

  it('must be before the regular season', () => {
    expect(preseasonTimeProblem(hours(48), { now, seasonStartsAt: hours(24) })).toMatch(/before the regular season/)
    expect(preseasonTimeProblem(hours(12), { now, seasonStartsAt: hours(24) })).toBeNull()
  })

  it('keeps 2 hours between matches', () => {
    const other = [{ scheduledAt: hours(10).toISOString(), label: 'NMG vs tV' }]
    expect(preseasonTimeProblem(hours(11), { now, otherMatches: other })).toMatch(/NMG vs tV/)
    expect(preseasonTimeProblem(hours(8.5), { now, otherMatches: other })).toMatch(/2 hours/)
    expect(preseasonTimeProblem(hours(12), { now, otherMatches: other })).toBeNull()
    expect(preseasonTimeProblem(hours(8), { now, otherMatches: other })).toBeNull()
  })
})

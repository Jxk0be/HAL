import { describe, expect, it } from 'vitest'
import { canLookFor, lookingForOptions, spotsSummary } from '@/lib/recruiting'

describe('recruiting', () => {
  it('only offers spots the team still has', () => {
    const spots = { open: 2, startersOpen: 0, subsOpen: 2 }
    expect(canLookFor('starter', spots)).toBe(false)
    expect(canLookFor('sub', spots)).toBe(true)
    expect(canLookFor('any', spots)).toBe(true)
    expect(lookingForOptions(spots).filter((o) => !o.disabled).map((o) => o.value)).toEqual(['sub', 'any'])
  })

  it('offers nothing once the roster is full', () => {
    const full = { open: 0, startersOpen: 0, subsOpen: 0 }
    expect(lookingForOptions(full).every((o) => o.disabled)).toBe(true)
    expect(spotsSummary(full)).toBe('Roster full')
  })

  it('summarizes open spots', () => {
    expect(spotsSummary({ open: 3, startersOpen: 1, subsOpen: 2 })).toBe('1 starter, 2 sub spots open')
    expect(spotsSummary({ open: 1, startersOpen: 0, subsOpen: 1 })).toBe('1 sub spot open')
  })
})

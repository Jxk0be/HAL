import { describe, expect, it } from 'vitest'
import { handleProblem, normalizeHandle, profileColorVar } from '@/lib/profileExtras'

describe('profile extras', () => {
  it('pulls the handle out of links and @names', () => {
    expect(normalizeHandle('https://www.twitch.tv/BIL_Casts')).toBe('BIL_Casts')
    expect(normalizeHandle('youtube.com/@bil.league')).toBe('bil.league')
    expect(normalizeHandle('https://x.com/bil_cod?s=20')).toBe('bil_cod')
    expect(normalizeHandle('https://www.tiktok.com/@bil.clips')).toBe('bil.clips')
    expect(normalizeHandle('  @kairo ')).toBe('kairo')
    expect(normalizeHandle('')).toBe('')
  })

  it('checks handles like the database does', () => {
    expect(handleProblem('twitch', 'ab')).toMatch(/Twitch/)
    expect(handleProblem('twitch', 'bil_casts')).toBeNull()
    expect(handleProblem('x', 'way_too_long_handle')).toMatch(/X/)
    expect(handleProblem('tiktok', '')).toBeNull()
  })

  it('maps colours to theme tokens', () => {
    expect(profileColorVar('blue')).toBe('var(--color-profile-blue)')
    expect(profileColorVar(null)).toBe('var(--color-profile-red)')
    expect(profileColorVar('pink')).toBe('var(--color-profile-red)')
  })
})

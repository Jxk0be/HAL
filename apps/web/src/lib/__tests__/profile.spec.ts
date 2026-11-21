import { describe, expect, it } from 'vitest'
import {
  isProfileComplete,
  normalizeActivisionId,
  profileErrorMessage,
  validateActivisionId,
} from '../validation/profile'
import { safeNext } from '../redirect'

describe('Activision ID validation', () => {
  it.each(['Kairo#1234567', 'Vex Nine#90210', '  Lumen # 1234567  ', 'ab#1234'])('accepts %s', (id) => {
    expect(validateActivisionId(id)).toBeNull()
  })

  it.each([
    ['', 'Enter your Activision ID.'],
    ['Kairo', 'Include the #'],
    ['Kairo#12', 'doesn’t look like'],
    ['#1234567', 'doesn’t look like'],
    ['a#b#1234567', 'doesn’t look like'],
  ])('rejects %j', (id, message) => {
    expect(validateActivisionId(id)).toContain(message)
  })

  it('normalises spaces around the #', () => {
    expect(normalizeActivisionId('  Lumen # 1234567 ')).toBe('Lumen#1234567')
  })
})

describe('isProfileComplete', () => {
  const base = {
    activision_id: 'Kairo#1234567',
    platform: 'playstation' as const,
    age_confirmed_at: '2026-01-01T00:00:00Z',
    controller_confirmed_at: '2026-01-01T00:00:00Z',
  }

  it('needs every console field', () => {
    expect(isProfileComplete(base)).toBe(true)
    expect(isProfileComplete({ ...base, controller_confirmed_at: null })).toBe(false)
    expect(isProfileComplete({ ...base, age_confirmed_at: null })).toBe(false)
    expect(isProfileComplete(null)).toBe(false)
  })

  it('treats PC the same as consoles (no extra pledge)', () => {
    expect(isProfileComplete({ ...base, platform: 'pc' })).toBe(true)
  })
})

describe('profileErrorMessage', () => {
  it('explains a taken Activision ID', () => {
    expect(profileErrorMessage({ code: '23505', message: 'duplicate key' })).toContain('already registered')
  })
  it('passes rule messages through', () => {
    expect(profileErrorMessage({ code: 'P0001', message: 'You are on a team.' })).toBe('You are on a team.')
  })
  it('hides other database errors', () => {
    expect(profileErrorMessage({ code: 'XX000', message: 'internal' })).toBe(
      'Could not save your profile. Please try again.',
    )
  })
})

describe('safeNext', () => {
  it('allows same-site paths only', () => {
    expect(safeNext('/my-team')).toBe('/my-team')
    expect(safeNext('//evil.example')).toBe('/profile')
    expect(safeNext('https://evil.example')).toBe('/profile')
    expect(safeNext(undefined, '/')).toBe('/')
  })
})

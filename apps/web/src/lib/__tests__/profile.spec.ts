import { describe, expect, it } from 'vitest'
import {
  hasFinishedSetup,
  isProfileComplete,
  rankStatus,
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

  it('normalizes spaces around the #', () => {
    expect(normalizeActivisionId('  Lumen # 1234567 ')).toBe('Lumen#1234567')
  })
})

describe('isProfileComplete', () => {
  const base = {
    activision_id: 'Kairo#1234567',
    platform: 'playstation' as const,
    age_confirmed_at: '2026-01-01T00:00:00Z',
    controller_confirmed_at: '2026-01-01T00:00:00Z',
    cod_rank: 'gold' as const,
    rank_exception_at: null,
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

  it('needs a rank from Gold to Crimson, or Iridescent with an approved exception (rules 2.8–2.9)', () => {
    expect(isProfileComplete({ ...base, cod_rank: null })).toBe(false)
    for (const r of ['gold', 'platinum', 'diamond', 'crimson'] as const) expect(isProfileComplete({ ...base, cod_rank: r })).toBe(true)
    for (const r of ['bronze', 'silver', 'top250', 'iridescent'] as const) expect(isProfileComplete({ ...base, cod_rank: r })).toBe(false)
    expect(isProfileComplete({ ...base, cod_rank: 'iridescent', rank_exception_at: '2026-01-02T00:00:00Z' })).toBe(true)
  })

  it('counts setup as finished with any rank, so ineligible players are not stuck on onboarding', () => {
    expect(hasFinishedSetup({ ...base, cod_rank: 'bronze' })).toBe(true)
    expect(hasFinishedSetup({ ...base, cod_rank: null })).toBe(false)
  })
})

describe('rankStatus', () => {
  it.each([
    [null, null, 'missing'],
    ['silver', null, 'too_low'],
    ['gold', null, 'eligible'],
    ['crimson', null, 'eligible'],
    ['iridescent', null, 'needs_exception'],
    ['iridescent', '2026-01-02T00:00:00Z', 'eligible'],
    ['top250', '2026-01-02T00:00:00Z', 'too_high'],
  ] as const)('%s (exception %s) is %s', (rank, at, status) => {
    expect(rankStatus(rank, at)).toBe(status)
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

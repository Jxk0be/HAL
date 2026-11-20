import { describe, expect, it } from 'vitest'
import { rosterCounts, sortRoster, validateLogo, validateTag, validateTeamName, type RosterPlayer } from '../teams'
import { dbErrorMessage } from '../errors'

const player = (over: Partial<RosterPlayer>): RosterPlayer => ({
  memberId: over.name ?? 'm',
  userId: over.name ?? 'u',
  role: 'starter',
  joinedAt: '2026-01-01T00:00:00Z',
  name: 'Player',
  avatarUrl: null,
  activisionId: null,
  platform: null,
  isCaptain: false,
  isCoCaptain: false,
  ...over,
})

describe('team validation', () => {
  it('checks names and tags', () => {
    expect(validateTeamName('Seraphim')).toBeNull()
    expect(validateTeamName(' a ')).toContain('at least 2')
    expect(validateTeamName('x'.repeat(41))).toContain('40')
    expect(validateTag('SRPH')).toBeNull()
    expect(validateTag('ab')).toBeNull()
    expect(validateTag('TOOLONG')).not.toBeNull()
    expect(validateTag('A!')).not.toBeNull()
  })

  it('checks logo files', () => {
    expect(validateLogo(new File(['x'], 'l.png', { type: 'image/png' }))).toBeNull()
    expect(validateLogo(new File(['x'], 'l.gif', { type: 'image/gif' }))).toContain('PNG')
    const big = new File([new Uint8Array(1024 * 1024 + 1)], 'l.png', { type: 'image/png' })
    expect(validateLogo(big)).toContain('1 MB')
  })
})

describe('roster helpers', () => {
  const roster = [
    player({ name: 'Zed', role: 'sub' }),
    player({ name: 'Amy', role: 'starter' }),
    player({ name: 'Cap', isCaptain: true }),
    player({ name: 'Co', isCoCaptain: true, role: 'sub' }),
  ]

  it('orders captain, co-captain, starters, subs', () => {
    expect(sortRoster(roster).map((p) => p.name)).toEqual(['Cap', 'Co', 'Amy', 'Zed'])
  })

  it('counts starters and subs', () => {
    expect(rosterCounts(roster)).toEqual({ total: 4, starters: 2, subs: 2 })
  })
})

describe('dbErrorMessage', () => {
  it('passes league rule messages through', () => {
    expect(dbErrorMessage({ code: 'P0001', message: 'Your roster is full (max 7 players)' })).toBe(
      'Your roster is full (max 7 players)',
    )
  })
  it('hides raw row-level security errors', () => {
    expect(
      dbErrorMessage({ code: '42501', message: 'new row violates row-level security policy for table "teams"' }),
    ).toBe("You don't have permission to do that.")
  })
  it('uses the unique message for duplicates', () => {
    expect(dbErrorMessage({ code: '23505', message: 'dup' }, 'x', 'Name taken.')).toBe('Name taken.')
  })
})

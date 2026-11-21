import { describe, expect, it } from 'vitest'
import { boardTeams, filterRows, formatKd, formatPlusMinus, topBy, type LeaderboardRow } from '../leaderboard'

const row = (over: Partial<LeaderboardRow>): LeaderboardRow => ({
  user_id: 'u',
  activision_id: 'Player',
  avatar_url: null,
  team_id: null,
  team_name: null,
  team_tag: null,
  maps_played: 1,
  kills: 10,
  deaths: 10,
  kd: 1,
  plus_minus: 0,
  avg_score: 1000,
  incomplete: false,
  incomplete_reason: null,
  ...over,
})

const rows = [
  row({ user_id: 'a', activision_id: 'Face', team_id: 't1', team_tag: 'SNT', team_name: 'Saints', kills: 174, kd: 2.23 }),
  row({ user_id: 'b', activision_id: 'recursion', kills: 88, kd: 4.63, maps_played: 2 }),
  row({ user_id: 'c', activision_id: 'Kee', team_id: 't2', team_tag: 'ELO', team_name: 'Elo', kills: 146, kd: 1.27 }),
  row({ user_id: 'd', activision_id: 'NoData', maps_played: 0, kills: 0, kd: null, avg_score: null, incomplete: true }),
]

describe('filterRows', () => {
  it('filters by team, free agents and name', () => {
    expect(filterRows(rows, { team: 'all', search: '' })).toHaveLength(4)
    expect(filterRows(rows, { team: 't1', search: '' }).map((r) => r.user_id)).toEqual(['a'])
    expect(filterRows(rows, { team: 'free', search: '' }).map((r) => r.user_id)).toEqual(['b', 'd'])
    expect(filterRows(rows, { team: 'all', search: ' KE ' }).map((r) => r.user_id)).toEqual(['c'])
  })
})

describe('topBy', () => {
  it('ranks everyone with a value, with no minimum maps', () => {
    expect(topBy(rows, 'kd', 3).map((r) => r.user_id)).toEqual(['b', 'a', 'c'])
    expect(topBy(rows, 'kills', 2).map((r) => r.user_id)).toEqual(['a', 'c'])
  })
  it('leaves out players with no maps yet', () => {
    expect(topBy(rows, 'avg_score', 10).some((r) => r.user_id === 'd')).toBe(false)
  })
})

describe('helpers', () => {
  it('lists the teams on the board by tag', () => {
    expect(boardTeams(rows).map((t) => t.tag)).toEqual(['ELO', 'SNT'])
  })
  it('formats K/D and plus/minus', () => {
    expect(formatKd(null)).toBe('—')
    expect(formatKd(4.6)).toBe('4.60')
    expect(formatPlusMinus(5)).toBe('+5')
    expect(formatPlusMinus(-3)).toBe('-3')
    expect(formatPlusMinus(0)).toBe('0')
  })
})

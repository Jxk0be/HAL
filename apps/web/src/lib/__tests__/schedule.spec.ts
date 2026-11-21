import { describe, expect, it } from 'vitest'
import { bracketOrder, generateSchedule, playoffPairs, scheduleSummary } from '../schedule'
import { formatLeagueTime, mondayOf, zonedToUtc } from '../time'
import { computeStandings } from '../standings'

const teams = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`)
const opts = (n: number, seed = 1) => ({
  teamIds: teams(n),
  weeks: 8,
  nights: ['tue', 'thu'] as const,
  startDate: '2027-01-05',
  matchTime: '21:00',
  timezone: 'America/New_York',
  seed,
})

describe('zonedToUtc (DST)', () => {
  it('converts 9 PM Eastern in January (EST, UTC-5)', () => {
    expect(zonedToUtc('2027-01-12', '21:00').toISOString()).toBe('2027-01-13T02:00:00.000Z')
  })
  it('converts 9 PM Eastern in March before and after DST starts (Mar 14, 2027)', () => {
    expect(zonedToUtc('2027-03-11', '21:00').toISOString()).toBe('2027-03-12T02:00:00.000Z')
    expect(zonedToUtc('2027-03-16', '21:00').toISOString()).toBe('2027-03-17T01:00:00.000Z')
  })
  it('formats back to 9:00 PM ET', () => {
    expect(formatLeagueTime('2027-03-17T01:00:00.000Z')).toBe('Tue, Mar 16 · 9:00 PM ET')
    expect(formatLeagueTime('2027-01-13T02:00:00.000Z')).toBe('Tue, Jan 12 · 9:00 PM ET')
  })
  it('finds the Monday of a week', () => {
    expect(mondayOf('2027-01-07')).toBe('2027-01-04')
    expect(mondayOf('2027-01-04')).toBe('2027-01-04')
    expect(mondayOf('2027-01-10')).toBe('2027-01-04')
  })
})

describe('generateSchedule', () => {
  for (const n of [6, 7, 8, 16]) {
    describe(`${n} teams`, () => {
      const schedule = generateSchedule(opts(n))
      const summary = scheduleSummary(schedule, teams(n))

      it('never pairs a team with itself', () => {
        expect(schedule.matches.every((m) => m.homeTeamId !== m.awayTeamId)).toBe(true)
      })

      it('has no team playing twice on one night, and at most 2 games a week', () => {
        for (const id of teams(n)) {
          const games = schedule.matches.filter((m) => m.homeTeamId === id || m.awayTeamId === id)
          const nights = games.map((g) => g.date)
          expect(new Set(nights).size).toBe(nights.length)
          for (let w = 1; w <= 8; w++) expect(games.filter((g) => g.week === w).length).toBeLessThanOrEqual(2)
        }
      })

      if (n % 2 === 0) {
        it('gives every team exactly 2 matches every week', () => {
          for (const id of teams(n)) {
            for (let w = 1; w <= 8; w++) {
              const c = schedule.matches.filter((m) => m.week === w && (m.homeTeamId === id || m.awayTeamId === id))
              expect(c.length).toBe(2)
            }
          }
        })
      } else {
        it('spreads byes evenly', () => {
          const byes = summary.map((s) => s.byes)
          expect(Math.max(...byes) - Math.min(...byes)).toBeLessThanOrEqual(1)
        })
      }

      it('balances home and away', () => {
        for (const s of summary) expect(Math.abs(s.home - s.away)).toBeLessThanOrEqual(2)
      })

      it('spreads repeat opponents evenly', () => {
        for (const s of summary) {
          const counts = [...s.opponents.values()]
          expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
        }
      })

      it('puts every match at 9 PM Eastern on Tue/Thu', () => {
        for (const m of schedule.matches) {
          expect(formatLeagueTime(m.defaultAt)).toMatch(/^(Tue|Thu), .* · 9:00 PM ET$/)
        }
      })
    })
  }

  it('is deterministic per seed and changes with a new seed', () => {
    expect(generateSchedule(opts(6, 7))).toEqual(generateSchedule(opts(6, 7)))
    expect(generateSchedule(opts(6, 7))).not.toEqual(generateSchedule(opts(6, 8)))
  })
})

describe('playoffs', () => {
  it('seeds 1v8, 4v5, 2v7, 3v6', () => {
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
    expect(playoffPairs(teams(8))).toEqual([
      ['t1', 't8'],
      ['t4', 't5'],
      ['t2', 't7'],
      ['t3', 't6'],
    ])
  })
})

describe('computeStandings', () => {
  const t = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Bravo' },
    { id: 'c', name: 'Charlie' },
  ]
  const win = (home: string, away: string, winner: string, maps: [number, number][]) => ({
    homeTeamId: home,
    awayTeamId: away,
    winnerTeamId: winner,
    maps: maps.map(([h, a], i) => ({ number: i + 1, homeScore: h, awayScore: a })),
  })

  it('orders by series wins, then map differential', () => {
    const rows = computeStandings(t, [
      win('a', 'b', 'a', [[250, 200], [6, 3], [3, 1]]),
      win('c', 'b', 'c', [[250, 100], [6, 4], [2, 3], [3, 2]]),
    ])
    expect(rows.map((r) => r.teamId)).toEqual(['a', 'c', 'b'])
    expect(rows[0]).toMatchObject({ wins: 1, mapDiff: 3 })
  })

  it('uses head-to-head when wins and map differential tie', () => {
    const rows = computeStandings(t, [
      win('b', 'a', 'b', [[250, 200], [6, 3], [3, 1]]),
      win('a', 'c', 'a', [[250, 200], [6, 3], [3, 1]]),
      win('c', 'b', 'c', [[250, 200], [6, 3], [3, 1]]),
    ])
    // All 1-1 with +0 maps; head-to-head is a cycle, so deciding-map rounds and admin decide.
    expect(rows.every((r) => r.wins === 1 && r.mapDiff === 0)).toBe(true)
    expect(rows.every((r) => r.needsAdminDecision)).toBe(true)
  })
})

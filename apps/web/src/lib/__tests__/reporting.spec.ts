import { describe, expect, it } from 'vitest'
import {
  describeMismatch,
  emptyMap,
  fromSubmission,
  kd,
  mapsNeeded,
  parsePastedRow,
  parseStat,
  screenshotPath,
  seriesState,
  toPayload,
  validateReport,
  type ReportMap,
} from '../reporting'

const sides = { homeTeamId: 'H', awayTeamId: 'A' }
const home = ['h1', 'h2', 'h3', 'h4']
const away = ['a1', 'a2', 'a3', 'a4']

function filledMap(homeScore: number, awayScore: number, n: number): ReportMap {
  const m = emptyMap(sides, home, away)
  m.modeId = 'mode'
  m.mapId = 'map'
  m.homeScore = homeScore
  m.awayScore = awayScore
  m.screenshots = [screenshotPath('M', 'H', n, 1)]
  m.players = m.players.map((p, i) => ({ ...p, kills: 10 + i, deaths: 8, score: 1000 }))
  return m
}

describe('seriesState and mapsNeeded', () => {
  it('counts map wins and when the series was decided', () => {
    const s = seriesState([
      { homeScore: 250, awayScore: 200 },
      { homeScore: 3, awayScore: 6 },
      { homeScore: 250, awayScore: 100 },
      { homeScore: 6, awayScore: 5 },
    ])
    expect(s).toEqual({ home: 3, away: 1, decidedAt: 3, finished: true })
  })

  it('shows 3 maps to start, one more while undecided, never more than 5', () => {
    expect(mapsNeeded([])).toBe(3)
    expect(mapsNeeded([{ homeScore: 1, awayScore: 0 }, { homeScore: 0, awayScore: 1 }, { homeScore: 1, awayScore: 0 }])).toBe(4)
    const fourPlayed = [
      { homeScore: 1, awayScore: 0 },
      { homeScore: 0, awayScore: 1 },
      { homeScore: 1, awayScore: 0 },
      { homeScore: 0, awayScore: 1 },
    ]
    expect(mapsNeeded(fourPlayed)).toBe(5)
    expect(mapsNeeded([{ homeScore: 1, awayScore: 0 }, { homeScore: 1, awayScore: 0 }, { homeScore: 1, awayScore: 0 }])).toBe(3)
  })
})

describe('validateReport', () => {
  it('accepts a complete 3-0', () => {
    expect(validateReport([filledMap(250, 200, 1), filledMap(6, 3, 2), filledMap(250, 100, 3)], sides)).toEqual([])
  })

  it('flags unfinished series, ties, maps after the decider and missing screenshots', () => {
    const tie = filledMap(5, 5, 2)
    const noShot = filledMap(250, 100, 3)
    noShot.screenshots = []
    const issues = validateReport([filledMap(250, 200, 1), tie, noShot], sides)
    expect(issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        'The series isn’t finished: one team needs 3 map wins.',
        'A map can’t end in a tie.',
        'Add at least one scoreboard screenshot.',
      ]),
    )

    const extra = validateReport(
      [filledMap(1, 0, 1), filledMap(1, 0, 2), filledMap(1, 0, 3), filledMap(1, 0, 4)],
      sides,
    )
    expect(extra).toContainEqual({ map: 3, message: 'This map was played after the series was decided. Remove it.' })
  })

  it('needs 8 different players with all stats', () => {
    const m = filledMap(250, 200, 1)
    m.players[1] = { ...m.players[1]!, userId: 'h1' }
    m.players[7] = { ...m.players[7]!, kills: null }
    const messages = validateReport([m, filledMap(1, 0, 2), filledMap(1, 0, 3)], sides).map((i) => i.message)
    expect(messages).toContain('A player is listed twice.')
    expect(messages).toContain('Fill in kills, deaths and score for every player.')
  })
})

describe('input helpers', () => {
  it('parses stats and pasted spreadsheet rows', () => {
    expect(parseStat('')).toBeNull()
    expect(parseStat(' 12 ')).toBe(12)
    expect(parseStat('3,400')).toBe(3400)
    expect(parseStat('1.5')).toBeUndefined()
    expect(parsePastedRow('24\t18\t3,400')).toEqual([24, 18, 3400])
    expect(parsePastedRow('24 18 3400')).toEqual([24, 18, 3400])
    expect(parsePastedRow('24\tabc')).toBeNull()
  })

  it('formats K/D', () => {
    expect(kd(30, 20)).toBe('1.50')
    expect(kd(5, 0)).toBe('5.00')
    expect(kd(null, 3)).toBe('—')
  })

  it('round-trips a stored submission', () => {
    const maps = [filledMap(250, 200, 1), filledMap(6, 3, 2), filledMap(250, 100, 3)]
    const payload = toPayload(maps)
    const back = fromSubmission(
      {
        maps: payload.maps.map(({ number, mode_id, map_id, home_score, away_score }) => ({ number, mode_id, map_id, home_score, away_score })),
        player_stats: payload.maps.map((m) => ({ number: m.number, players: m.players })),
        screenshot_paths: payload.maps.flatMap((m) => m.screenshots),
      },
      sides,
    )
    expect(back).toEqual(maps)
  })

  it('describes mismatches without values', () => {
    expect(describeMismatch({ map_number: 2, kind: 'player_stat', field: 'kills', player: 'jake', resolved: false })).toBe('Map 2: jake’s kills')
    expect(describeMismatch({ map_number: 1, kind: 'map_score', field: 'home_score', player: null, resolved: false })).toBe('Map 1: home score')
  })
})

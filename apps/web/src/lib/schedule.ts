/**
 * Regular-season schedule generator (circle-method round robin).
 *
 * The season has weeks × nights "rounds" (8 × 2 = 16). Each round, every team plays once (or has
 * a bye when the team count is odd). The round robin needs n−1 rounds for n teams (n rounded up
 * to even); when that's fewer than the season's rounds, further cycles repeat it with home and
 * away swapped and the round order rotated, so repeat opponents are spread evenly.
 */
import { addDays, mondayOf, NIGHTS, zonedToUtc, type Night } from './time'

export interface ScheduleOptions {
  teamIds: string[]
  weeks: number
  nights: readonly Night[]
  /** Any date in week 1 (YYYY-MM-DD); week 1 starts on its Monday. */
  startDate: string
  /** Wall-clock match time, HH:MM. */
  matchTime: string
  timezone: string
  seed: number
}

export interface GeneratedMatch {
  week: number // 1-based
  round: number // 1-based across the season
  night: Night
  date: string // YYYY-MM-DD in the league time zone
  defaultAt: string // ISO UTC instant
  homeTeamId: string
  awayTeamId: string
}

export interface Schedule {
  matches: GeneratedMatch[]
  /** Teams sitting out each round (odd team counts). */
  byes: { round: number; teamId: string }[]
}

/** Small deterministic PRNG so "Regenerate" with the same seed gives the same schedule. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const rand = mulberry32(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

const BYE = '__bye__'

/** One full round robin: n−1 rounds of pairs [home, away] (n even, may include BYE). */
export function roundRobin(teams: readonly string[]): [string, string][][] {
  const list = teams.length % 2 === 0 ? [...teams] : [...teams, BYE]
  const n = list.length
  const rounds: [string, string][][] = []
  const fixed = list[0]!
  let rotating = list.slice(1)
  for (let r = 0; r < n - 1; r++) {
    const order = [fixed, ...rotating]
    const pairs: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = order[i]!
      const b = order[n - 1 - i]!
      // Alternate home/away: the fixed team flips each round; other pairs by position and round.
      const flip = i === 0 ? r % 2 === 1 : (i + r) % 2 === 1
      pairs.push(flip ? [b, a] : [a, b])
    }
    rounds.push(pairs)
    rotating = [rotating[rotating.length - 1]!, ...rotating.slice(0, -1)]
  }
  return rounds
}

export function generateSchedule(opts: ScheduleOptions): Schedule {
  if (opts.teamIds.length < 2) return { matches: [], byes: [] }
  const nights = [...opts.nights].sort((a, b) => NIGHTS.indexOf(a) - NIGHTS.indexOf(b))
  const totalRounds = opts.weeks * nights.length
  const base = roundRobin(shuffle(opts.teamIds, opts.seed))

  const matches: GeneratedMatch[] = []
  const byes: Schedule['byes'] = []
  const week1 = mondayOf(opts.startDate)
  // Running home-minus-away balance per team; each match gives home to the team that's had fewer.
  const balance = new Map<string, number>(opts.teamIds.map((id) => [id, 0]))
  const lastHome = new Map<string, boolean>()

  for (let round = 0; round < totalRounds; round++) {
    const cycle = Math.floor(round / base.length)
    // Later cycles: rotate the round order so a cycle doesn't start with the same opponents.
    const pairs = base[(round + cycle) % base.length]!
    const week = Math.floor(round / nights.length)
    const night = nights[round % nights.length]!
    const date = addDays(week1, week * 7 + NIGHTS.indexOf(night))
    const defaultAt = zonedToUtc(date, opts.matchTime, opts.timezone).toISOString()

    for (const [a, b] of pairs) {
      if (a === BYE || b === BYE) {
        byes.push({ round: round + 1, teamId: a === BYE ? b : a })
        continue
      }
      const ba = balance.get(a) ?? 0
      const bb = balance.get(b) ?? 0
      let aHome: boolean
      if (ba !== bb) aHome = ba < bb
      else if (lastHome.get(a) !== lastHome.get(b)) aHome = !lastHome.get(a) // alternate
      else aHome = cycle % 2 === 0
      const [home, away] = aHome ? [a, b] : [b, a]
      balance.set(home, (balance.get(home) ?? 0) + 1)
      balance.set(away, (balance.get(away) ?? 0) - 1)
      lastHome.set(home, true)
      lastHome.set(away, false)
      matches.push({ week: week + 1, round: round + 1, night, date, defaultAt, homeTeamId: home, awayTeamId: away })
    }
  }
  return { matches, byes }
}

/** Per-team counts used by the tests and the preview's fairness summary. */
export function scheduleSummary(schedule: Schedule, teamIds: string[]) {
  return teamIds.map((id) => {
    const games = schedule.matches.filter((m) => m.homeTeamId === id || m.awayTeamId === id)
    const opponents = new Map<string, number>()
    for (const g of games) {
      const opp = g.homeTeamId === id ? g.awayTeamId : g.homeTeamId
      opponents.set(opp, (opponents.get(opp) ?? 0) + 1)
    }
    return {
      teamId: id,
      games: games.length,
      home: games.filter((g) => g.homeTeamId === id).length,
      away: games.filter((g) => g.awayTeamId === id).length,
      byes: schedule.byes.filter((b) => b.teamId === id).length,
      opponents,
    }
  })
}

/** Single-elimination first round for a top-N bracket: 1v8, 4v5, 2v7, 3v6 (for 8). */
export function playoffPairs(seededTeamIds: string[]): [string, string][] {
  const n = seededTeamIds.length
  const order = bracketOrder(n)
  const pairs: [string, string][] = []
  for (let i = 0; i < order.length; i += 2) {
    const hi = seededTeamIds[order[i]! - 1]
    const lo = seededTeamIds[order[i + 1]! - 1]
    if (hi && lo) pairs.push([hi, lo])
  }
  return pairs
}

/** Standard bracket seed order: 8 -> [1,8,4,5,2,7,3,6]. n must be a power of two. */
export function bracketOrder(n: number): number[] {
  let order = [1, 2]
  while (order.length < n) {
    const size = order.length * 2
    order = order.flatMap((s) => [s, size + 1 - s])
  }
  return order
}

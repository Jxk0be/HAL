/**
 * Standings from confirmed regular-season results, with the rulebook's tiebreaks (rule 5.5):
 *   1. series wins  2. map differential  3. head-to-head among the tied teams
 *   4. round differential on deciding maps  5. admin decision (flagged, then by name)
 * "Deciding map" = the last map of each series (the map that settled it).
 */

export interface ResultMap {
  number: number
  homeScore: number
  awayScore: number
}

export interface Result {
  homeTeamId: string
  awayTeamId: string
  winnerTeamId: string | null
  maps: ResultMap[]
}

export interface StandingRow {
  teamId: string
  name: string
  played: number
  wins: number
  losses: number
  mapsWon: number
  mapsLost: number
  mapDiff: number
  decidingRoundDiff: number
  /** Still tied after every rule: an admin must decide the order. */
  needsAdminDecision: boolean
}

export function computeStandings(teams: { id: string; name: string }[], results: Result[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    teams.map((t) => [
      t.id,
      {
        teamId: t.id,
        name: t.name,
        played: 0,
        wins: 0,
        losses: 0,
        mapsWon: 0,
        mapsLost: 0,
        mapDiff: 0,
        decidingRoundDiff: 0,
        needsAdminDecision: false,
      },
    ]),
  )

  for (const r of results) {
    const home = rows.get(r.homeTeamId)
    const away = rows.get(r.awayTeamId)
    if (!home || !away || !r.winnerTeamId) continue
    home.played++
    away.played++
    if (r.winnerTeamId === r.homeTeamId) {
      home.wins++
      away.losses++
    } else {
      away.wins++
      home.losses++
    }
    for (const m of r.maps) {
      if (m.homeScore > m.awayScore) {
        home.mapsWon++
        away.mapsLost++
      } else if (m.awayScore > m.homeScore) {
        away.mapsWon++
        home.mapsLost++
      }
    }
    const deciding = [...r.maps].sort((a, b) => b.number - a.number)[0]
    if (deciding) {
      home.decidingRoundDiff += deciding.homeScore - deciding.awayScore
      away.decidingRoundDiff += deciding.awayScore - deciding.homeScore
    }
  }
  for (const row of rows.values()) row.mapDiff = row.mapsWon - row.mapsLost

  // Head-to-head series wins within a group of tied teams.
  const h2h = (group: StandingRow[]) => {
    const ids = new Set(group.map((g) => g.teamId))
    const wins = new Map(group.map((g) => [g.teamId, 0]))
    for (const r of results) {
      if (r.winnerTeamId && ids.has(r.homeTeamId) && ids.has(r.awayTeamId)) {
        wins.set(r.winnerTeamId, (wins.get(r.winnerTeamId) ?? 0) + 1)
      }
    }
    return wins
  }

  const byPrimary = (a: StandingRow, b: StandingRow) => b.wins - a.wins || b.mapDiff - a.mapDiff
  const sorted = [...rows.values()].sort(byPrimary)

  // Resolve groups tied on wins and map differential.
  const out: StandingRow[] = []
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1
    while (j < sorted.length && byPrimary(sorted[i]!, sorted[j]!) === 0) j++
    const group = sorted.slice(i, j)
    if (group.length > 1) {
      const wins = h2h(group)
      group.sort(
        (a, b) =>
          (wins.get(b.teamId) ?? 0) - (wins.get(a.teamId) ?? 0) ||
          b.decidingRoundDiff - a.decidingRoundDiff ||
          a.name.localeCompare(b.name),
      )
      for (let k = 0; k < group.length; k++) {
        const prev = group[k - 1]
        const next = group[k + 1]
        const same = (x?: StandingRow) =>
          x &&
          (wins.get(x.teamId) ?? 0) === (wins.get(group[k]!.teamId) ?? 0) &&
          x.decidingRoundDiff === group[k]!.decidingRoundDiff
        if (same(prev) || same(next)) group[k]!.needsAdminDecision = true
      }
    }
    out.push(...group)
    i = j
  }
  return out
}

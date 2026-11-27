/**
 * Single-elimination bracket view built from the playoff matches. Matches in a round are ordered
 * by scheduled time then id, the same order the playoff generator pairs winners in
 * (PlayoffGenerator.vue), so match i of round r feeds slot floor(i/2) of round r+1.
 */
export interface BracketMatchIn {
  id: string
  round: number
  scheduledAt: string
  status: string
  home: { id: string; tag: string; name: string; logoUrl: string | null }
  away: { id: string; tag: string; name: string; logoUrl: string | null }
  homeSeries: number | null
  awaySeries: number | null
  winnerTeamId: string | null
}

export interface BracketSlot {
  match: BracketMatchIn | null
  /** Shown when the match doesn't exist yet: "Winner of QF 1". */
  homeLabel: string
  awayLabel: string
}

export interface BracketRound {
  round: number
  name: string
  short: string
  slots: BracketSlot[]
}

/** "Final", "Semifinals", "Quarterfinals" or "Round n" for a bracket of `size` teams. */
export function roundName(round: number, size: number): { name: string; short: string } {
  const total = Math.log2(size)
  if (round === total) return { name: 'Final', short: 'Final' }
  if (round === total - 1) return { name: 'Semifinals', short: 'SF' }
  if (round === total - 2) return { name: 'Quarterfinals', short: 'QF' }
  return { name: `Round ${round}`, short: `R${round}` }
}

export function buildBracket(matches: BracketMatchIn[], size: number): BracketRound[] {
  const total = Math.round(Math.log2(size))
  if (!Number.isFinite(total) || total < 1 || 2 ** total !== size) return []
  const rounds: BracketRound[] = []
  for (let r = 1; r <= total; r++) {
    const inRound = matches
      .filter((m) => m.round === r)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id))
    const count = size / 2 ** r
    const prev = rounds[r - 2]
    const slots: BracketSlot[] = Array.from({ length: count }, (_, i) => {
      const feeder = (j: number) => (prev ? `Winner of ${prev.short} ${j + 1}` : 'TBD')
      return { match: inRound[i] ?? null, homeLabel: feeder(i * 2), awayLabel: feeder(i * 2 + 1) }
    })
    rounds.push({ round: r, ...roundName(r, size), slots })
  }
  return rounds
}

/** The champion once the final has a winner. */
export function champion(rounds: BracketRound[]): BracketMatchIn['home'] | null {
  const final = rounds.at(-1)?.slots[0]?.match
  if (!final?.winnerTeamId) return null
  return final.home.id === final.winnerTeamId ? final.home : final.away
}

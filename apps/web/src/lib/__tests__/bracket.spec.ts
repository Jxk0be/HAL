import { describe, expect, it } from 'vitest'
import { buildBracket, champion, roundName, type BracketMatchIn } from '@/lib/bracket'

const team = (tag: string) => ({ id: tag, tag, name: `Team ${tag}`, logoUrl: null })
const match = (id: string, round: number, at: string, h: string, a: string, winner: string | null = null): BracketMatchIn => ({
  id,
  round,
  scheduledAt: at,
  status: winner ? 'confirmed' : 'scheduled',
  home: team(h),
  away: team(a),
  homeSeries: null,
  awaySeries: null,
  winnerTeamId: winner,
})

describe('bracket', () => {
  it('names rounds by bracket size', () => {
    expect(roundName(1, 8).name).toBe('Quarterfinals')
    expect(roundName(2, 8).name).toBe('Semifinals')
    expect(roundName(3, 8).name).toBe('Final')
    expect(roundName(1, 16).name).toBe('Round 1')
  })

  it('lays out an 8-team bracket with placeholders for rounds not made yet', () => {
    const qf = [
      match('q2', 1, '2027-04-01T01:00:00Z', 'D', 'E', 'D'),
      match('q1', 1, '2027-04-01T01:00:00Z', 'A', 'H', 'A'),
      match('q3', 1, '2027-04-01T02:00:00Z', 'B', 'G'),
      match('q4', 1, '2027-04-01T02:00:00Z', 'C', 'F'),
    ]
    const rounds = buildBracket(qf, 8)
    expect(rounds.map((r) => r.slots.length)).toEqual([4, 2, 1])
    // Same order as the generator: time, then id.
    expect(rounds[0]!.slots.map((s) => s.match?.id)).toEqual(['q1', 'q2', 'q3', 'q4'])
    expect(rounds[1]!.slots[0]).toMatchObject({ match: null, homeLabel: 'Winner of QF 1', awayLabel: 'Winner of QF 2' })
    expect(rounds[2]!.slots[0]).toMatchObject({ homeLabel: 'Winner of SF 1', awayLabel: 'Winner of SF 2' })
    expect(champion(rounds)).toBeNull()
  })

  it('finds the champion and rejects odd sizes', () => {
    const rounds = buildBracket([match('f', 1, '2027-04-08T01:00:00Z', 'A', 'B', 'B')], 2)
    expect(champion(rounds)?.tag).toBe('B')
    expect(buildBracket([], 6)).toEqual([])
  })
})

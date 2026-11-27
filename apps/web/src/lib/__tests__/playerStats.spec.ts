import { describe, expect, it } from 'vitest'
import { bestBy, formatKd, kd, percent, trendPoints } from '@/lib/playerStats'

const line = (name: string, maps: number, kills: number, deaths: number) => ({ name, maps, kills, deaths, avg_score: 0, wins: 0 })

describe('player stats helpers', () => {
  it('formats K/D', () => {
    expect(kd(30, 20)).toBe(1.5)
    expect(kd(12, 0)).toBe(12)
    expect(formatKd(0, 0)).toBe('—')
    expect(formatKd(25, 20)).toBe('1.25')
  })

  it('formats percentages', () => {
    expect(percent(2, 3)).toBe('67%')
    expect(percent(0, 0)).toBe('—')
  })

  it('picks the best line with enough maps', () => {
    const lines = [line('Hardpoint', 4, 80, 60), line('SnD', 1, 20, 2), line('Control', 3, 45, 50)]
    expect(bestBy(lines)?.name).toBe('Hardpoint')
    expect(bestBy([line('SnD', 1, 20, 2)])).toBeNull()
  })

  it('plots K/D per week with a fixed floor and room for big weeks', () => {
    const weeks = [
      { week: 1, maps: 3, kills: 30, deaths: 30, avg_score: 0 },
      { week: 2, maps: 3, kills: 75, deaths: 30, avg_score: 0 },
    ]
    const { points, max } = trendPoints(weeks, 100, 50, 0)
    expect(max).toBe(2.5)
    expect(points[0]).toMatchObject({ x: 0, y: 30, value: 1 })
    expect(points[1]).toMatchObject({ x: 100, y: 0, value: 2.5 })
    expect(trendPoints([weeks[0]!], 100, 50, 0).points[0]!.x).toBe(50)
  })
})

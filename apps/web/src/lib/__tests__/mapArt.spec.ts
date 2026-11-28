import { describe, expect, it } from 'vitest'
import { mapArt, mapSlug } from '../mapArt'

describe('mapSlug', () => {
  it('uses the first word, lowercased', () => {
    expect(mapSlug('Reactor')).toBe('reactor')
    expect(mapSlug('Reactor U92')).toBe('reactor')
    expect(mapSlug('  Rooftops ')).toBe('rooftops')
    expect(mapSlug('Coal-2')).toBe('coal')
  })
})

describe('mapArt', () => {
  it('finds bundled art by name', () => {
    const art = mapArt({ name: 'Lotus' })
    expect(art?.custom).toBe(false)
    expect(art?.src).toMatch(/lotus/)
    expect(art?.srcSm).toMatch(/lotus-sm/)
  })
  it('prefers an uploaded image', () => {
    expect(mapArt({ name: 'Lotus', imageUrl: 'https://x.test/a.webp' })).toEqual({ src: 'https://x.test/a.webp', srcSm: null, custom: true })
  })
  it('returns null when there is no art', () => {
    expect(mapArt({ name: 'Nowhere' })).toBeNull()
  })
})

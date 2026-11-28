/**
 * Map artwork for the calling-card map tiles. Admin-uploaded art (maps.image_url) wins; otherwise
 * the bundled art in assets/maps/<slug>.webp (built by scripts/render-maps.py), matched by the
 * first word of the map's name ("Reactor" and "Reactor U92" both → reactor).
 */
const files = import.meta.glob<string>('../assets/maps/*.webp', { eager: true, query: '?url', import: 'default' })

const bundled = new Map<string, { src: string; srcSm: string | null }>()
for (const [path, url] of Object.entries(files)) {
  const file = path.split('/').pop()!.replace(/\.webp$/, '')
  if (file.endsWith('-sm')) continue
  bundled.set(file, { src: url, srcSm: files[path.replace(/\.webp$/, '-sm.webp')] ?? null })
}

export function mapSlug(name: string): string {
  return (name.trim().split(/[\s\-_]+/)[0] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export interface MapArt {
  src: string
  /** Smaller copy for narrow cards (bundled art only). */
  srcSm: string | null
  /** Uploaded by an admin rather than bundled with the site. */
  custom: boolean
}

export function mapArt(map: { name: string; imageUrl?: string | null }): MapArt | null {
  if (map.imageUrl) return { src: map.imageUrl, srcSm: null, custom: true }
  const b = bundled.get(mapSlug(map.name))
  return b ? { ...b, custom: false } : null
}

/** Every bundled map image (full size), in name order: the home page backdrop cycles through them. */
export function bundledMapArt(): string[] {
  return [...bundled.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v.src)
}

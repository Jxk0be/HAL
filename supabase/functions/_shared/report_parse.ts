/**
 * Parses /report modal lines like "Hardpoint | Vista | 250-187" (home score first). Pure and
 * tested in report_parse_test.ts. Mirrors the site's series rules (src/lib/reporting.ts) and
 * submit_report(): 3 to 5 maps, first to 3, nothing after the decider, no ties, map legal in mode.
 */

export interface NamedItem {
  id: string
  name: string
}

export interface ParsedMap {
  number: number
  mode_id: string
  map_id: string
  home_score: number
  away_score: number
  modeName: string
  mapName: string
}

export type ParseResult = { ok: true; maps: ParsedMap[] } | { ok: false; errors: string[] }

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** True when the letters of `abbr` appear in order in `name`, starting with its first letter ("snd" → "Search and Destroy"). */
function isAbbreviation(abbr: string, name: string): boolean {
  const a = compact(abbr)
  const n = compact(name)
  if (!a || a[0] !== n[0]) return false
  let i = 0
  for (const ch of n) if (ch === a[i]) i++
  return i === a.length
}

/** Exact name (any case), else the only name it is a prefix of, else the only abbreviation match. */
export function matchName(input: string, items: NamedItem[]): { item?: NamedItem; error?: string } {
  const q = input.trim().toLowerCase()
  if (!q) return { error: 'is missing' }
  const exact = items.find((i) => i.name.toLowerCase() === q || compact(i.name) === compact(q))
  if (exact) return { item: exact }
  for (const candidates of [items.filter((i) => i.name.toLowerCase().startsWith(q)), items.filter((i) => isAbbreviation(q, i.name))]) {
    if (candidates.length === 1) return { item: candidates[0] }
    if (candidates.length > 1) return { error: `"${input.trim()}" matches ${candidates.map((p) => p.name).join(', ')}; type more of it` }
  }
  return { error: `"${input.trim()}" isn't one of: ${items.map((i) => i.name).join(', ')}` }
}

export function parseReportLines(
  lines: string[],
  data: { modes: NamedItem[]; maps: NamedItem[]; legal: Set<string> },
): ParseResult {
  const errors: string[] = []
  const maps: ParsedMap[] = []
  const filled = lines.map((l) => l.trim())
  // Ignore trailing blank inputs, but not gaps in the middle.
  let last = filled.length - 1
  while (last >= 0 && !filled[last]) last--
  const used = filled.slice(0, last + 1)

  if (used.length < 3) errors.push('A series is at least 3 maps: fill in maps 1 to 3.')

  used.forEach((line, i) => {
    const n = i + 1
    if (!line) {
      errors.push(`Map ${n}: empty. Fill in every map up to the last one played.`)
      return
    }
    const parts = line.split(/\s*[|/,]\s*/).filter((p) => p !== '')
    if (parts.length !== 3) {
      errors.push(`Map ${n}: write it as "Mode | Map | home-away", e.g. "Hardpoint | Vista | 250-187".`)
      return
    }
    const [modeIn, mapIn, scoreIn] = parts as [string, string, string]
    const score = /^(\d{1,6})\s*[-–:x]\s*(\d{1,6})$/i.exec(scoreIn)
    const mode = matchName(modeIn, data.modes)
    const map = matchName(mapIn, data.maps)
    if (mode.error) errors.push(`Map ${n}: mode ${mode.error}.`)
    if (map.error) errors.push(`Map ${n}: map ${map.error}.`)
    if (!score) errors.push(`Map ${n}: score "${scoreIn}" should look like 250-187 (home first).`)
    if (!mode.item || !map.item || !score) return
    if (!data.legal.has(`${map.item.id}:${mode.item.id}`)) {
      errors.push(`Map ${n}: ${map.item.name} isn't played in ${mode.item.name}.`)
      return
    }
    const home = Number(score[1])
    const away = Number(score[2])
    if (home === away) {
      errors.push(`Map ${n}: a map can't end in a tie (${home}-${away}).`)
      return
    }
    maps.push({ number: n, mode_id: mode.item.id, map_id: map.item.id, home_score: home, away_score: away, modeName: mode.item.name, mapName: map.item.name })
  })

  if (!errors.length) {
    let h = 0
    let a = 0
    maps.forEach((m) => {
      if (h === 3 || a === 3) errors.push(`Map ${m.number}: played after the series was decided. Remove it.`)
      if (m.home_score > m.away_score) h++
      else a++
    })
    if (h < 3 && a < 3) errors.push(`The series isn't finished (${h}-${a}): one team needs 3 map wins.`)
  }
  return errors.length ? { ok: false, errors } : { ok: true, maps }
}

/** Series score from parsed maps. */
export function seriesOf(maps: Pick<ParsedMap, 'home_score' | 'away_score'>[]): { home: number; away: number } {
  return maps.reduce((s, m) => (m.home_score > m.away_score ? { ...s, home: s.home + 1 } : { ...s, away: s.away + 1 }), { home: 0, away: 0 })
}

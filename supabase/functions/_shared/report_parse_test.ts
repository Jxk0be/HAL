import { assertEquals } from 'jsr:@std/assert@1'
import { matchName, parseReportLines, seriesOf } from './report_parse.ts'

const modes = [
  { id: 'hp', name: 'Hardpoint' },
  { id: 'snd', name: 'Search and Destroy' },
  { id: 'ctl', name: 'Control' },
]
const maps = [
  { id: 'v', name: 'Vista' },
  { id: 'vb', name: 'Vault' },
  { id: 'r', name: 'Rio' },
]
const legal = new Set(['v:hp', 'vb:hp', 'r:hp', 'v:snd', 'r:snd', 'r:ctl'])
const data = { modes, maps, legal }

Deno.test('names match exactly or by a unique prefix, in any case', () => {
  assertEquals(matchName('hardpoint', modes).item?.id, 'hp')
  assertEquals(matchName('search', modes).item?.id, 'snd')
  assertEquals(matchName('V', maps).error?.includes('Vista, Vault'), true)
  assertEquals(matchName('vis', maps).item?.id, 'v')
  assertEquals(matchName('Nuketown', maps).error?.startsWith('"Nuketown" isn\'t one of'), true)
})

Deno.test('a clean 3-1 parses', () => {
  const r = parseReportLines(['Hardpoint | Vista | 250-187', 'snd / rio / 6-3', 'ctl, rio, 2:3', 'hp | vault | 250 - 249', ''], data)
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.maps.map((m) => [m.mode_id, m.map_id, m.home_score, m.away_score]), [
      ['hp', 'v', 250, 187],
      ['snd', 'r', 6, 3],
      ['ctl', 'r', 2, 3],
      ['hp', 'vb', 250, 249],
    ])
    assertEquals(seriesOf(r.maps), { home: 3, away: 1 })
  }
})

Deno.test('errors name the line and the reason', () => {
  const r = parseReportLines(['Hardpoint | Vista | 250-250', 'snd | vault | 6-3', 'xyz | rio | 6-3'], data)
  assertEquals(r.ok, false)
  if (!r.ok) {
    assertEquals(r.errors, [
      "Map 1: a map can't end in a tie (250-250).",
      "Map 2: Vault isn't played in Search and Destroy.",
      'Map 3: mode "xyz" isn\'t one of: Hardpoint, Search and Destroy, Control.',
    ])
  }
})

Deno.test('series maths: unfinished, played after the decider, gaps', () => {
  const unfinished = parseReportLines(['hp|vista|250-1', 'hp|vista|1-250', 'hp|vista|250-1'], data)
  assertEquals(!unfinished.ok && unfinished.errors[0], "The series isn't finished (2-1): one team needs 3 map wins.")
  const extra = parseReportLines(['hp|vista|250-1', 'hp|vista|250-1', 'hp|vista|250-1', 'hp|vista|250-1'], data)
  assertEquals(!extra.ok && extra.errors[0], 'Map 4: played after the series was decided. Remove it.')
  const gap = parseReportLines(['hp|vista|250-1', '', 'hp|vista|250-1', 'hp|vista|250-1'], data)
  assertEquals(!gap.ok && gap.errors[0], 'Map 2: empty. Fill in every map up to the last one played.')
  const format = parseReportLines(['Hardpoint Vista 250-187', 'hp|vista|1-0', 'hp|vista|1-0'], data)
  assertEquals(!format.ok && format.errors[0]!.startsWith('Map 1: write it as'), true)
})

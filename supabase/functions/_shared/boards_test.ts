import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1'
import { boardHash, potwPost, rosterBoard, scheduleBoard, standingsTable, subBoard, volunteerNotice, type ScheduleMatch } from './boards.ts'

const SITE = 'https://bil.example'

Deno.test('roster: captain first, starters and subs split, nobody pinged', () => {
  const msg = rosterBoard(
    {
      id: 't1',
      name: 'Vectorize',
      tag: 'tV',
      logoUrl: null,
      division: 'Premier',
      players: [
        { name: 'ace', discordId: '1', role: 'starter', captain: false, coCaptain: false },
        { name: 'boss', discordId: '2', role: 'starter', captain: true, coCaptain: false },
        { name: 'benchy', discordId: null, role: 'sub', captain: false, coCaptain: false },
      ],
    },
    SITE,
  )
  assertEquals(msg.allowed_mentions, { parse: [] })
  const e = msg.embeds![0]!
  assertEquals(e.title, '[tV] Vectorize')
  assertEquals(e.fields![0]!.value.split('\n')[0], '**boss** <@2> · **Captain**')
  assertEquals(e.fields![1]!.name, 'Subs (1)')
})

Deno.test('standings table: aligned columns and a playoff line', () => {
  const table = standingsTable(
    [
      { rank: 1, tag: 'AAA', name: 'Alpha', wins: 3, losses: 0, mapsWon: 9, mapsLost: 2 },
      { rank: 2, tag: 'BBB', name: 'A very long team name here', wins: 1, losses: 2, mapsWon: 4, mapsLost: 7 },
      { rank: 3, tag: 'CCC', name: 'Gamma', wins: 0, losses: 3, mapsWon: 1, mapsLost: 9 },
    ],
    2,
  )
  const lines = table.split('\n').slice(1, -1)
  assertEquals(new Set(lines.map((l) => l.length)).size, 1) // every row the same width
  assert(lines[1]!.endsWith('+7'))
  assert(lines[3]!.startsWith('─')) // line after the 2nd team
})

Deno.test('schedule: result, upcoming and canceled lines', () => {
  const m = (id: string, status: string, at: string): ScheduleMatch => ({
    id,
    scheduledAt: at,
    status,
    home: { name: 'Alpha', tag: 'AAA' },
    away: { name: 'Beta', tag: 'BBB' },
    homeSeries: 3,
    awaySeries: 1,
    division: null,
  })
  const d = scheduleBoard({ seasonName: 'Season 1', week: 2, matches: [m('b', 'scheduled', '2027-01-07T02:00:00Z'), m('a', 'confirmed', '2027-01-05T02:00:00Z'), m('c', 'cancelled', '2027-01-08T02:00:00Z')] }, SITE)
  const lines = d.embeds![0]!.description!.split('\n')
  assert(lines[0]!.startsWith('✅') && lines[0]!.includes('**3-1**'))
  assert(lines[1]!.startsWith('<t:'))
  assert(lines[2]!.startsWith('~~'))
})

Deno.test('sub board: buttons carry match and team, volunteers listed', () => {
  const msg = subBoard(
    {
      matchId: 'm1',
      teamId: 't1',
      teamName: 'Alpha',
      teamTag: 'AAA',
      opponentName: 'Beta',
      opponentTag: 'BBB',
      scheduledAt: '2027-01-07T02:00:00Z',
      needed: 1,
      volunteers: [{ userId: 'u', discordId: '5', name: 'glare' }],
    },
    SITE,
  )
  // deno-lint-ignore no-explicit-any
  const ids = (msg.components![0] as any).components.map((b: { custom_id: string }) => b.custom_id)
  assertEquals(ids, ['subs:yes:m1:t1', 'subs:no:m1:t1'])
  assertEquals(msg.embeds![0]!.title, '[AAA] Alpha needs 1 emergency sub')
  assertEquals(msg.embeds![0]!.fields![0]!.value, '• **glare** <@5>')
  assertEquals(msg.allowed_mentions, { parse: [] })
})

Deno.test('volunteer notice pings only the captains', () => {
  const n = volunteerNotice({ teamId: 't', matchId: 'm', opponentName: 'Beta' }, 'glare', ['1', '2'], SITE)
  assertEquals(n.allowed_mentions, { parse: [], users: ['1', '2'] })
})

Deno.test('player of the week pings the winner only, and nothing without players', () => {
  const p = (name: string, id: string | null) => ({ discordId: id, name, teamTag: 'AAA', maps: 6, kills: 120, deaths: 80, kd: 1.5, avgScore: 3400 })
  const post = potwPost({ weekLabel: 'Week of Mon, Jan 4', players: [p('ace', '9'), p('two', '8')] }, SITE)!
  assertEquals(post.allowed_mentions, { parse: [], users: ['9'] })
  assertEquals(post.embeds![0]!.title, 'Player of the Week: [AAA] ace')
  assertEquals(potwPost({ weekLabel: 'x', players: [] }, SITE), null)
})

Deno.test('board hash ignores the embed timestamp but not the content', async () => {
  const a = { embeds: [{ title: 'x', timestamp: '2027-01-01T00:00:00Z' }] }
  const b = { embeds: [{ title: 'x', timestamp: '2027-02-01T00:00:00Z' }] }
  const c = { embeds: [{ title: 'y', timestamp: '2027-01-01T00:00:00Z' }] }
  assertEquals(await boardHash(a), await boardHash(b))
  assertNotEquals(await boardHash(a), await boardHash(c))
})

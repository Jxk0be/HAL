import { assert, assertEquals } from 'jsr:@std/assert@1'
import { disputeAlert, leaderboardEmbed, matchPost, queueBoard, resolvedAlert, type EightsMatch } from './eights.ts'
import { parseCustomId } from './interactions.ts'

const player = (n: number) => ({ userId: `u${n}`, name: `Player${n}`, discordId: `${1000 + n}` })
const match = (over: Partial<EightsMatch> = {}): EightsMatch => ({
  id: 'm1',
  number: 7,
  status: 'live',
  winner: null,
  mapName: 'Rooftops',
  modeName: 'Hardpoint',
  teamA: [1, 2, 3, 4].map(player),
  teamB: [5, 6, 7, 8].map(player),
  reports: [],
  ...over,
})
// deno-lint-ignore no-explicit-any
const buttons = (p: { components?: unknown[] }) => (p.components ?? []).flatMap((r: any) => r.components.map((b: any) => b.custom_id as string))

Deno.test('queue board lists players, shows the count and has join / leave / leaderboard', () => {
  const p = queueBoard([player(1), player(2)])
  assertEquals(p.embeds![0]!.title, '8s queue · 2/8')
  assert(p.embeds![0]!.fields![0]!.value.includes('<@1001>'))
  assertEquals(buttons(p), ['eights:join', 'eights:leave', 'eights:board'])
  assertEquals(p.allowed_mentions, { parse: [] })
  assertEquals(queueBoard([]).embeds![0]!.fields![0]!.value, 'Nobody yet. Be the first.')
})

Deno.test('a live match pings exactly its 8 players and offers both report buttons', () => {
  const p = matchPost(match({ reports: [{ userId: 'u1', team: 'a', winner: 'a' }] }))
  assertEquals(p.allowed_mentions!.users!.length, 8)
  assert(p.content!.includes('<@1001>') && p.content!.includes('<@1008>'))
  assert(p.embeds![0]!.description!.includes('Hardpoint** on **Rooftops'))
  assert(p.embeds![0]!.description!.includes('Team A 1/2 · Team B 0/2'))
  assertEquals(buttons(p), ['eights:won:m1:a', 'eights:won:m1:b', 'eights:cancel:m1'])
  // custom_id round-trips through the router's parser
  assertEquals(parseCustomId('eights:won:m1:a'), { feature: 'eights', action: 'won', id: 'm1:a' })
})

Deno.test('a settled match offers Queue again and shows the winner', () => {
  const p = matchPost(match({ status: 'confirmed', winner: 'b' }))
  assertEquals(buttons(p), ['eights:join'])
  assert(p.embeds![0]!.description!.includes('Team B won'))
  assert(p.embeds![0]!.fields![1]!.name.startsWith('🏆'))
  assertEquals(buttons(matchPost(match({ status: 'disputed' }))), ['eights:join'])
})

Deno.test('while voting the post has one button per mode, the tally and the closing time; no report buttons', () => {
  const p = matchPost(
    match({
      status: 'voting',
      mapName: null,
      modeName: null,
      vote: {
        endsAt: '2026-11-25T20:02:00Z',
        options: [
          { modeId: 'hp', name: 'Hardpoint', votes: 3 },
          { modeId: 'snd', name: 'Search & Destroy', votes: 1 },
          { modeId: 'hj', name: 'Hijack', votes: 0 },
        ],
      },
    }),
  )
  assertEquals(buttons(p), ['eights:vote:m1:hp', 'eights:vote:m1:snd', 'eights:vote:m1:hj', 'eights:cancel:m1'])
  const d = p.embeds![0]!.description!
  assert(d.includes('Mode: voting now'))
  assert(d.includes('<t:1795636920:R>'))
  assert(d.includes('Votes (4/8): Hardpoint **3** · Search & Destroy **1** · Hijack **0**'))
})

Deno.test('dispute alert shows who said what and has settle buttons; resolved alert drops them', () => {
  const m = match({
    status: 'disputed',
    reports: [
      { userId: 'u1', team: 'a', winner: 'a' },
      { userId: 'u5', team: 'b', winner: 'b' },
    ],
  })
  const a = disputeAlert(m)
  assert(a.embeds![0]!.description!.includes('**Player1** <@1001> (Team A) says **Team A won**'))
  assertEquals(buttons(a), ['eights:fix:m1:a', 'eights:fix:m1:b', 'eights:fix:m1:cancel'])
  const r = resolvedAlert({ ...m, status: 'cancelled' }, 'jake')
  assertEquals(buttons(r), [])
  assert(r.embeds![0]!.description!.includes('cancelled'))
})

Deno.test('leaderboard ranks with medals and handles an empty board', () => {
  const p = leaderboardEmbed([
    { name: 'A', discordId: null, wins: 3, losses: 1, played: 4, winPct: 75 },
    { name: 'B', discordId: null, wins: 2, losses: 0, played: 2, winPct: 100 },
  ])
  assert(p.embeds![0]!.description!.includes('🥇 A · **3W** 1L · 75%'))
  assertEquals(leaderboardEmbed([]).embeds![0]!.description, 'No confirmed 8s matches yet.')
})

Deno.test('cancel requests show on the post and the button; a vote cancel says so and offers Queue again', () => {
  const live = matchPost(match({ cancelRequests: 3 }))
  assert(live.embeds![0]!.description!.includes('Cancel requests: **3/5**'))
  // deno-lint-ignore no-explicit-any
  const cancel = (live.components as any[])[0].components[2]
  assertEquals(cancel.label, 'Request cancel (3/5)')
  assertEquals(cancel.style, 4)
  assert(!matchPost(match()).embeds![0]!.description!.includes('Cancel requests'))

  const byVote = matchPost(match({ status: 'cancelled', cancelledByVote: true, cancelRequests: 5 }))
  assert(byVote.embeds![0]!.description!.includes('5 players asked to cancel'))
  assertEquals(buttons(byVote), ['eights:join'])
  assert(matchPost(match({ status: 'cancelled' })).embeds![0]!.description!.includes('Cancelled by an admin'))
})

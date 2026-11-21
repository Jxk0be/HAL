import { assertEquals } from 'jsr:@std/assert@1'
import { dueKinds } from './plan.ts'
import { discordTime, resultMessage, rescheduleMessage, topPerformer, missingCheckinMessage } from '../_shared/match_messages.ts'

const T = '2027-03-10T02:00:00.000Z'
const at = (minutesBefore: number) => new Date(T).getTime() - minutesBefore * 60_000

Deno.test('reminders and check-in fire in their windows', () => {
  assertEquals(dueKinds(T, at(25 * 60), false), [])
  assertEquals(dueKinds(T, at(24 * 60), false), ['reminder_24h'])
  assertEquals(dueKinds(T, at(61), false), ['reminder_24h'])
  assertEquals(dueKinds(T, at(60), false), ['reminder_1h'])
  assertEquals(dueKinds(T, at(16), false), ['reminder_1h'])
  assertEquals(dueKinds(T, at(15), false), ['reminder_1h', 'checkin'])
  assertEquals(dueKinds(T, at(0), false), ['checkin', 'checkin_missing'])
  assertEquals(dueKinds(T, at(-29), false), ['checkin', 'checkin_missing'])
  assertEquals(dueKinds(T, at(-30), false), [])
})

Deno.test('a checked-in team gets no check-in post or warning', () => {
  assertEquals(dueKinds(T, at(10), true), ['reminder_1h'])
  assertEquals(dueKinds(T, at(-5), true), [])
})

const match = {
  id: 'm1',
  week: 3,
  scheduledAt: T,
  home: { id: 'h', name: 'Seraphim', tag: 'SRPH' },
  away: { id: 'a', name: 'Gatekeepers', tag: 'GATE' },
}

Deno.test('results bold the winner and list maps and the top performer', () => {
  const msg = resultMessage(
    { ...match, status: 'confirmed', homeSeries: 3, awaySeries: 1, winnerTeamId: 'h', forfeitTeamId: null },
    [{ number: 1, mode: 'Hardpoint', map: 'Vista', homeScore: 250, awayScore: 200 }],
    { name: 'kairo', team: 'SRPH', kills: 30, deaths: 20, maps: 1 },
    'https://hal.example',
  )
  const e = msg.embeds![0]!
  assertEquals(e.description!.startsWith('**Seraphim 3** – Gatekeepers 1'), true)
  assertEquals(e.fields![0], { name: 'Map 1 · Hardpoint', value: 'Vista: 250 – 200', inline: true })
  assertEquals(e.fields![1]!.value.includes('1.50 K/D'), true)
  assertEquals(msg.allowed_mentions, { parse: [] })
})

Deno.test('forfeits say who won by forfeit', () => {
  const msg = resultMessage({ ...match, status: 'forfeit', homeSeries: null, awaySeries: null, winnerTeamId: 'a', forfeitTeamId: 'h' }, [], null, 'https://hal.example')
  assertEquals(msg.embeds![0]!.description!.startsWith('**Gatekeepers** wins by forfeit'), true)
})

Deno.test('top performer is best K/D with at least one map', () => {
  const top = topPerformer([
    { userId: 'u1', name: 'a', team: 'X', kills: 20, deaths: 10, mapId: 'm1' },
    { userId: 'u1', name: 'a', team: 'X', kills: 10, deaths: 10, mapId: 'm2' },
    { userId: 'u2', name: 'b', team: 'Y', kills: 18, deaths: 9, mapId: 'm1' },
  ])
  assertEquals(top, { name: 'b', team: 'Y', kills: 18, deaths: 9, maps: 1 })
  assertEquals(topPerformer([]), null)
})

Deno.test('reschedule and missing check-in messages', () => {
  const r = rescheduleMessage(match, 'requested', 'a', '2027-03-11T02:00:00.000Z', 'https://hal.example')
  assertEquals(r.embeds![0]!.description!.includes('**Gatekeepers** requested a reschedule to <t:'), true)
  const miss = missingCheckinMessage(match, 'h', ['123'], 'https://hal.example')
  assertEquals(miss.content, '<@123>')
  assertEquals(miss.allowed_mentions, { users: ['123'] })
  assertEquals(discordTime(T, 'R'), `<t:${new Date(T).getTime() / 1000}:R>`)
})

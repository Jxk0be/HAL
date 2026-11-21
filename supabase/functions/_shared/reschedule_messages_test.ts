import { assertEquals } from 'jsr:@std/assert@1'
import { rescheduleOutcomeMessage, rescheduleRequestMessage } from './match_messages.ts'
import { COMMANDS } from './commands.ts'

const m = {
  id: 'm1',
  week: 2,
  scheduledAt: '2027-03-11T02:00:00.000Z',
  home: { id: 'h', name: 'Seraphim', tag: 'SRPH' },
  away: { id: 'a', name: 'Gatekeepers', tag: 'GATE' },
}
const r = { id: 'r1', teamId: 'h', proposedAt: '2027-03-12T01:00:00.000Z' }

Deno.test('only the opponent gets Accept and Decline', () => {
  const opp = rescheduleRequestMessage(m, r, 'a', 'https://hal.example')
  // deno-lint-ignore no-explicit-any
  const ids = (opp.components![0] as any).components.map((c: any) => c.custom_id)
  assertEquals(ids, ['reschedule:accept:r1', 'reschedule:decline:r1'])
  assertEquals(rescheduleRequestMessage(m, r, 'h', 'https://hal.example').components, [])
  assertEquals(opp.embeds![0]!.description!.includes(`<t:${Date.parse(r.proposedAt) / 1000}:F>`), true)
})

Deno.test('the outcome removes the buttons and names who answered', () => {
  const done = rescheduleOutcomeMessage(m, { ...r, status: 'accepted' }, 'kairo', 'https://hal.example')
  assertEquals(done.components, [])
  assertEquals(done.embeds![0]!.description!.includes('Accepted by **kairo**'), true)
})

Deno.test('/reschedule has match, day (autocomplete) and 12 time choices', () => {
  const cmd = COMMANDS.find((c) => c.name === 'reschedule')
  // deno-lint-ignore no-explicit-any
  const opts = cmd!.options as any[]
  assertEquals(opts.map((o) => o.name), ['match', 'day', 'time'])
  assertEquals(opts[0].autocomplete && opts[1].autocomplete, true)
  assertEquals(opts[2].choices.length, 12)
})

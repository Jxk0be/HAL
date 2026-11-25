import { assertEquals } from 'jsr:@std/assert@1'
import { disputeOpeningMessage, disputeThreadName, recusedNote } from './dispute_messages.ts'
import { COMMANDS } from './commands.ts'

const base = {
  disputeId: '1a2b3c4d-0000-0000-0000-000000000000',
  matchId: 'm1',
  week: 3,
  homeName: 'Seraphim',
  awayName: 'Gatekeepers',
  openedByTeam: 'Gatekeepers',
  category: 'stats',
  reason: 'Kills on map 2 are wrong',
  evidence: [{ url: 'https://youtu.be/x', note: 'clip', image: false }],
  captainIds: ['1', '2'],
  adminIds: ['9'],
}

Deno.test('thread names are short and identify the match', () => {
  assertEquals(disputeThreadName(base.disputeId, 'SRPH', 'GATE'), 'Dispute #1a2b3c4d · SRPH vs GATE')
})

Deno.test('the opening post pings only the captains and non-recused admins', () => {
  const msg = disputeOpeningMessage(base, 'https://hal.example')
  assertEquals(msg.allowed_mentions, { users: ['1', '2', '9'] })
  assertEquals(msg.content, 'Captains: <@1> <@2>\nBIL Admin: <@9>')
  assertEquals(msg.embeds![0]!.fields![0]!.value, '• [clip](https://youtu.be/x)')
  // deno-lint-ignore no-explicit-any
  assertEquals((msg.components![0] as any).components[0].url, 'https://hal.example/admin/disputes')
})

Deno.test('recusal note only when someone was left out', () => {
  assertEquals(recusedNote(0), null)
  assertEquals(recusedNote(1)!.content!.startsWith('Recused staff excluded: 1 admin'), true)
})

Deno.test('/dispute has match, reason choices and an optional attachment', () => {
  const cmd = COMMANDS.find((c) => c.name === 'dispute')
  // deno-lint-ignore no-explicit-any
  const opts = cmd!.options as any[]
  assertEquals(opts.map((o) => o.name), ['match', 'reason', 'evidence'])
  assertEquals(opts[1].choices.length, 6)
  assertEquals(opts[2].required, false)
})

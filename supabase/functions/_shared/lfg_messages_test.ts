import { assertEquals } from 'jsr:@std/assert@1'
import { lfgModal, lfgPostMessage, modalValues } from './lfg_messages.ts'
import { COMMANDS } from './commands.ts'

const post = {
  userId: 'u1',
  discordId: '42',
  activisionId: 'Kairo#1234567',
  discordUsername: 'kairo',
  platform: 'playstation',
  role: 'SMG',
  availability: 'Weeknights',
  note: 'Ex-Challengers',
}

Deno.test('lfg post shows the player, never pings, and has the invite button', () => {
  const msg = lfgPostMessage(post, 'https://hal.example')
  assertEquals(msg.allowed_mentions, { parse: [] })
  // The plain name comes first: a non-pinging mention can show as @unknown-user.
  assertEquals(msg.content, '**kairo** (<@42>) is looking for a team')
  assertEquals(msg.embeds![0]!.title, 'Kairo#1234567')
  assertEquals(msg.embeds![0]!.fields![0], { name: 'Platform', value: 'PlayStation', inline: true })
  // deno-lint-ignore no-explicit-any
  assertEquals((msg.components![0] as any).components[0].custom_id, 'lfg:invite:u1')
})

Deno.test('the modal has at most 5 inputs and prefills when editing', () => {
  const m = lfgModal({ role: 'AR', availability: null, note: 'hi' })
  assertEquals(m.components.length <= 5, true)
  // deno-lint-ignore no-explicit-any
  assertEquals((m.components[0]!.components[0] as any).value, 'AR')
  // deno-lint-ignore no-explicit-any
  assertEquals('value' in (m.components[1]!.components[0] as any), false)
})

Deno.test('modal values are read by custom_id', () => {
  assertEquals(
    modalValues([{ type: 1, components: [{ type: 4, custom_id: 'role', value: 'Flex' }] }, { type: 1, components: [{ type: 4, custom_id: 'note', value: '' }] }]),
    { role: 'Flex', note: '' },
  )
})

Deno.test('/lfg is registered with post and remove', () => {
  const lfg = COMMANDS.find((c) => c.name === 'lfg')
  // deno-lint-ignore no-explicit-any
  assertEquals((lfg?.options as any[]).map((o) => o.name), ['post', 'remove'])
})

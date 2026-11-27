import { assertEquals } from 'jsr:@std/assert@1'
import { archivedOverwrites, matchChannelName, openOverwrites, pickCategory, shouldOpen } from './matchday_messages.ts'
import { perms, PERMISSIONS } from './discord.ts'

const T = '2027-03-02T02:00:00.000Z'
const at = (mins: number) => new Date(T).getTime() + mins * 60_000

Deno.test('opens 15 minutes before, and not hours after', () => {
  assertEquals(shouldOpen(T, at(-16)), false)
  assertEquals(shouldOpen(T, at(-15)), true)
  assertEquals(shouldOpen(T, at(120)), true)
  assertEquals(shouldOpen(T, at(6 * 60)), false)
})

Deno.test('channel names carry the week or playoff round', () => {
  const a = { id: 'a', name: 'Night Owls', tag: 'OWL' }
  const b = { id: 'b', name: 'No Mercy', tag: 'nmg' }
  assertEquals(matchChannelName(3, 'regular', null, a, b).startsWith('W3-'), true)
  assertEquals(matchChannelName(9, 'playoff', 2, a, b).startsWith('P2-'), true)
})

Deno.test('open lets both teams in; archived keeps admins read-only and drops the teams', () => {
  const open = openOverwrites({ guildId: 'g', teamRoleIds: ['t1', 't2'], adminRoleId: 'adm', casterRoleId: null, botUserId: 'bot' })
  assertEquals(open.map((o) => o.id), ['g', 't1', 't2', 'adm', 'bot'])
  const closed = archivedOverwrites({ guildId: 'g', adminRoleId: 'adm', botUserId: 'bot' })
  assertEquals(closed.map((o) => o.id), ['g', 'adm', 'bot'])
  assertEquals(closed[1]!.deny, perms(PERMISSIONS.SEND_MESSAGES))
})

Deno.test('archive categories fill one after another', () => {
  const full = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, name: `x${i}`, type: 0, parent_id: 'arch1' }))
  const channels = [{ id: 'arch1', name: 'Match Archive', type: 4 }, ...full]
  assertEquals(pickCategory('Match Archive', channels), { id: null, name: 'Match Archive 2' })
  const withSecond = [...channels, { id: 'arch2', name: 'Match Archive 2', type: 4 }]
  assertEquals(pickCategory('Match Archive', withSecond).id, 'arch2')
  assertEquals(pickCategory('Match Day', []), { id: null, name: 'Match Day' })
})

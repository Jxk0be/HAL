import { assertEquals } from 'jsr:@std/assert@1'
import { inviteClosedDm, inviteDm, inviteTeamNotice } from './invite_messages.ts'

const SITE = 'https://hal.example'
const i = {
  id: 'inv1',
  team: { id: 't1', name: 'Team Vectorize', tag: 'tV' },
  captain: 'jake',
  player: 'glare#5860427',
  role: null,
  expiresAt: '2027-01-08T00:00:00Z',
}
// deno-lint-ignore no-explicit-any
const btns = (p: any) => p.components[0].components

Deno.test('the DM has Accept / Decline and a team link, and never pings', () => {
  const dm = inviteDm(i, SITE)
  assertEquals(dm.allowed_mentions, { parse: [] })
  assertEquals(btns(dm).map((b: { custom_id?: string; url?: string }) => b.custom_id ?? b.url), ['invite:accept:inv1', 'invite:decline:inv1', `${SITE}/teams/t1`])
  assertEquals(dm.embeds![0]!.description!.includes('**jake** invited you'), true)
})

Deno.test('closing the invite disables the buttons and says why', () => {
  const done = inviteClosedDm(i, 'accepted', SITE)
  assertEquals(btns(done).slice(0, 2).every((b: { disabled?: boolean }) => b.disabled), true)
  assertEquals(done.embeds![0]!.title, 'You joined Team Vectorize')
  assertEquals(inviteClosedDm(i, 'expired', SITE).embeds![0]!.title, 'Invite expired')
})

Deno.test('the team channel hears the answer', () => {
  assertEquals(inviteTeamNotice(i, true, SITE).embeds![0]!.title, 'glare#5860427 joined the team')
  assertEquals(inviteTeamNotice(i, false, SITE).embeds![0]!.title, 'glare#5860427 declined the invite')
})

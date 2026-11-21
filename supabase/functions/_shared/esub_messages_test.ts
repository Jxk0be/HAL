import { assertEquals } from 'jsr:@std/assert@1'
import { esubAdminMessage, esubAnsweredDm, esubInviteDm, esubTeamMessage } from './esub_messages.ts'

const r = {
  id: 'req1',
  team: { id: 't1', name: 'Team Vectorize', tag: 'tV' },
  match: {
    id: 'm1',
    week: 3,
    scheduledAt: '2027-03-09T02:00:00Z',
    home: { id: 't1', name: 'Team Vectorize', tag: 'tV' },
    away: { id: 't2', name: 'Elo', tag: 'ELO' },
  },
  player: 'Kairo#1234567',
  captain: 'jake',
  note: 'Our 4th is sick',
}
const SITE = 'https://hal.example'

// deno-lint-ignore no-explicit-any
const buttons = (p: any) => p.components[0].components

Deno.test('the DM asks for consent with Accept / Decline and never pings', () => {
  const dm = esubInviteDm(r, SITE)
  assertEquals(dm.allowed_mentions, { parse: [] })
  assertEquals(buttons(dm).map((b: { custom_id?: string }) => b.custom_id), ['esub:accept:req1', 'esub:decline:req1', undefined])
  assertEquals(dm.embeds![0]!.description!.includes('Nothing happens unless you accept'), true)
  assertEquals(dm.embeds![0]!.description!.includes('> Our 4th is sick'), true)
  assertEquals(dm.embeds![0]!.description!.includes('<t:1804557600:F>'), true)
})

Deno.test('answering disables the buttons', () => {
  const done = esubAnsweredDm(r, true, SITE)
  assertEquals(buttons(done).slice(0, 2).every((b: { disabled?: boolean }) => b.disabled), true)
  assertEquals(done.embeds![0]!.title, 'You accepted')
})

Deno.test('admin posts: heads-up on request, ping only when ready and close to match time', () => {
  const withOut = { ...r, out: [{ name: 'Nemo', reason: 'Sick' }, { name: 'Oki', reason: null }] }
  const heads = esubAdminMessage(withOut, SITE, 'requested', '99')
  assertEquals(heads.content!.startsWith('**Emergency sub requested:**'), true)
  assertEquals(heads.content!.includes('Out: Nemo (Sick), Oki'), true)
  assertEquals(heads.allowed_mentions, { parse: [] })
  const ready = esubAdminMessage(withOut, SITE, 'accepted', '99')
  assertEquals(ready.content!.startsWith('<@&99> **Emergency sub to approve:**'), true)
  assertEquals(ready.allowed_mentions, { parse: [], roles: ['99'] })
  assertEquals(esubAdminMessage(withOut, SITE, 'accepted', null).content!.startsWith('**Emergency'), true)
})

Deno.test('admin and team messages carry the right links', () => {
  assertEquals(esubAdminMessage(r, SITE, 'accepted').content!.endsWith(`${SITE}/admin/rosters`), true)
  assertEquals(esubTeamMessage(r, 'declined', SITE).embeds![0]!.title, 'Emergency sub declined')
  assertEquals(esubTeamMessage(r, 'approved', SITE).embeds![0]!.description!.includes(`${SITE}/matches/m1`), true)
})

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  inviteMessage,
  pairingIntro,
  preseasonChannelName,
  preseasonOverwrites,
  proposalMessage,
  type ProposalView,
} from './preseason_messages.ts'
import { weekLabel } from './match_messages.ts'

const nmg = { id: 't1', name: 'Nocturn Militia Gaming', tag: 'NMG' }
const tv = { id: 't2', name: 'Team Vectorize', tag: 'tV' }
const SITE = 'https://bil.example'

// deno-lint-ignore no-explicit-any
const customIds = (p: { components?: unknown[] }) => (p.components ?? []).flatMap((r: any) => r.components.map((c: any) => c.custom_id ?? c.url))

Deno.test('preseason channel name keeps capitals with bold letters', () => {
  const name = preseasonChannelName(nmg, tv)
  assert(name.includes('-vs-'))
  assert(!/[A-Z]/.test(name), 'plain capitals would be lowercased by Discord')
  assertEquals(preseasonChannelName({ ...nmg, tag: '!!' }, tv).split('-vs-').length, 2)
})

Deno.test('preseason channel: hidden from everyone, open to both teams, admins, casters and the bot', () => {
  const o = preseasonOverwrites({ guildId: 'g', teamRoleIds: ['r1', 'r2'], adminRoleId: 'a', casterRoleId: 'c', botUserId: 'b' })
  assertEquals(o[0], { id: 'g', type: 0, deny: '1024' })
  assertEquals(o.map((x) => x.id), ['g', 'r1', 'r2', 'a', 'c', 'b'])
  assertEquals(o.at(-1)?.type, 1)
  // No caster role set up yet: just skipped.
  assertEquals(preseasonOverwrites({ guildId: 'g', teamRoleIds: ['r1', 'r2'], adminRoleId: 'a', casterRoleId: null, botUserId: 'b' }).length, 5)
})

Deno.test('invite: buttons while open, link only once closed', () => {
  const open = inviteMessage({ team: nmg, interested: null, respondedBy: null, closed: false }, SITE)
  assertEquals(customIds(open), ['preseason:in:t1', 'preseason:out:t1', `${SITE}/my-team`])
  const yes = inviteMessage({ team: nmg, interested: true, respondedBy: 'jake', closed: false }, SITE)
  assertStringIncludes(yes.embeds![0]!.description!, 'is in')
  assertStringIncludes(yes.embeds![0]!.description!, 'jake')
  const closed = inviteMessage({ team: nmg, interested: true, respondedBy: 'jake', closed: true }, SITE)
  assertEquals(customIds(closed), [`${SITE}/my-team`])
  assertStringIncludes(closed.embeds![0]!.description!, 'Answers are closed')
})

Deno.test('intro explains proposing and the 2-hour rule', () => {
  const d = pairingIntro({ home: nmg, away: tv }, SITE).embeds![0]!.description!
  assertStringIncludes(d, '/preseason')
  assertStringIncludes(d, '2 hours')
})

Deno.test('proposal: Accept/Decline only while pending', () => {
  const p: ProposalView = { id: 'p1', proposer: nmg, other: tv, proposedAt: '2026-12-01T02:00:00Z', status: 'pending', responder: null, currentAt: null }
  assertEquals(customIds(proposalMessage(p, SITE)), ['preseason:accept:p1', 'preseason:decline:p1'])
  assertStringIncludes(proposalMessage(p, SITE).embeds![0]!.description!, 'Team Vectorize')
  const done = proposalMessage({ ...p, status: 'accepted', responder: 'cowboy' }, SITE)
  assertEquals(done.components, [])
  assertStringIncludes(done.embeds![0]!.description!, 'cowboy')
  assertStringIncludes(proposalMessage({ ...p, currentAt: '2026-11-30T02:00:00Z' }, SITE).embeds![0]!.description!, 'Currently set for')
})

Deno.test('week label says Preseason for week 0', () => {
  assertEquals(weekLabel(0), 'Preseason')
  assertEquals(weekLabel(3), 'Week 3')
})

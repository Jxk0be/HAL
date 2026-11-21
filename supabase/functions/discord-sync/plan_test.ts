import { assertEquals } from 'jsr:@std/assert@1'
import { desiredRoles, roleDiff, teamChannelName, teamChannelOverwrites, type FixedRoles } from './plan.ts'

const fixed: FixedRoles = { captain: 'cap', free_agent: 'fa', admin: 'adm', caster: 'cst', player: 'ply' }
const base = { teamRoleId: null, isCaptain: false, isFreeAgent: false, profileComplete: true, banned: false, staffRoles: [] }

Deno.test('rostered captain gets team, player and captain roles', () => {
  assertEquals([...desiredRoles({ ...base, teamRoleId: 't1', isCaptain: true }, fixed)].sort(), ['cap', 'ply', 't1'])
})

Deno.test('free agents need a complete profile and no ban', () => {
  assertEquals([...desiredRoles({ ...base, isFreeAgent: true }, fixed)], ['fa'])
  assertEquals([...desiredRoles({ ...base, isFreeAgent: true, profileComplete: false }, fixed)], [])
  assertEquals([...desiredRoles({ ...base, isFreeAgent: true, banned: true }, fixed)], [])
})

Deno.test('staff roles map to HAL Admin and HAL Caster', () => {
  assertEquals([...desiredRoles({ ...base, staffRoles: ['owner'] }, fixed)], ['adm'])
  assertEquals([...desiredRoles({ ...base, staffRoles: ['caster'] }, fixed)], ['cst'])
})

Deno.test('roleDiff only removes roles HAL manages', () => {
  const managed = new Set(['cap', 'fa', 'adm', 'cst', 'ply', 't1', 't2'])
  const diff = roleDiff(['booster', 'fa', 't2'], new Set(['t1', 'ply']), managed)
  assertEquals(diff, { add: ['t1', 'ply'], remove: ['fa', 't2'] })
  assertEquals(roleDiff(['t1', 'ply'], new Set(['t1', 'ply']), managed), { add: [], remove: [] })
})

Deno.test('team channel names', () => {
  assertEquals(teamChannelName('SRPH', 'Seraphim Esports!'), 'srph-seraphim-esports')
  assertEquals(teamChannelName('ÉLT', 'Élite'), 'elt-elite')
  assertEquals(teamChannelName('??', '!!'), 'team')
})

Deno.test('team channel is hidden from everyone but the team, admins and the bot', () => {
  const o = teamChannelOverwrites({ guildId: 'g', teamRoleId: 't', adminRoleId: 'a', botUserId: 'b' })
  assertEquals(o[0], { id: 'g', type: 0, deny: '1024' })
  assertEquals(o.map((x) => x.id), ['g', 't', 'a', 'b'])
  assertEquals(o[3]?.type, 1)
})

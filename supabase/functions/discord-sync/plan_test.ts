import { assertEquals } from 'jsr:@std/assert@1'
import { desiredRoles, roleDiff, teamChannelName, teamChannelOverwrites, teamRolePlacement, type FixedRoles } from './plan.ts'

// Matches the real server: bot 7, admin 6, caster 5, captain 4, player 3, free agent 2, new team role 1.
const guildRoles = [
  { id: '100', position: 0 }, // @everyone
  { id: '107', position: 7 },
  { id: '106', position: 6 },
  { id: '105', position: 5 },
  { id: '104', position: 4 },
  { id: '103', position: 3 },
  { id: '102', position: 2 },
  { id: '101', position: 1 },
]

Deno.test('a new team role moves directly above Player', () => {
  assertEquals(teamRolePlacement(guildRoles, '101', '103', '104'), [
    { id: '102', position: 1 },
    { id: '103', position: 2 },
    { id: '101', position: 3 },
  ])
})

Deno.test('a team role already between Player and Captain stays put', () => {
  const placed = guildRoles.map((r) => ({ ...r, position: { '101': 3, '102': 1, '103': 2 }[r.id] ?? r.position }))
  assertEquals(teamRolePlacement(placed, '101', '103', '104'), [])
})

Deno.test('a team role above Captain is moved down', () => {
  const high = guildRoles.map((r) => (r.id === '101' ? { ...r, position: 5 } : r.id === '105' ? { ...r, position: 1 } : r))
  // order by position: 105(1),102(2),103(3),104(4),101(5),106,107 -> 105,102,103,101,104,106,107
  assertEquals(teamRolePlacement(high, '101', '103', '104'), [{ id: '101', position: 4 }, { id: '104', position: 5 }])
})

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
  // Matches what Discord stored when tested on the real server.
  assertEquals(teamChannelName('tV', 'Team Vectorize'), '【𝘁𝗩】𝗧𝗲𝗮𝗺-𝗩𝗲𝗰𝘁𝗼𝗿𝗶𝘇𝗲')
  assertEquals(teamChannelName('ÉLT', 'Élite 2!'), '【𝗘𝗟𝗧】𝗘𝗹𝗶𝘁𝗲-𝟮')
  assertEquals(teamChannelName('??', '!!'), 'team')
  assertEquals(teamChannelName('AB', 'x'.repeat(60)).length <= 100, true)
})

Deno.test('team channel is hidden from everyone but the team, admins and the bot', () => {
  const o = teamChannelOverwrites({ guildId: 'g', teamRoleId: 't', adminRoleId: 'a', botUserId: 'b' })
  assertEquals(o[0], { id: 'g', type: 0, deny: '1024' })
  assertEquals(o.map((x) => x.id), ['g', 't', 'a', 'b'])
  assertEquals(o[3]?.type, 1)
})

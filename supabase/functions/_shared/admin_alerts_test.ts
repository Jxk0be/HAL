import { assertEquals } from 'jsr:@std/assert@1'
import { disputeAlert, mismatchAlert, teamPendingAlert, unreportedAlert, withAdminPing } from './admin_alerts.ts'

const SITE = 'https://hal.example'
const m = {
  id: 'm1',
  week: 2,
  scheduledAt: '2027-03-09T02:00:00Z',
  home: { id: 'a', name: 'Alpha', tag: 'ALP' },
  away: { id: 'b', name: 'Bravo', tag: 'BRV' },
}

Deno.test('admin alerts ping only the BIL Admin role', () => {
  const p = withAdminPing(mismatchAlert(m, 3, SITE), '42')
  assertEquals(p.content, '<@&42>')
  assertEquals(p.allowed_mentions, { parse: [], roles: ['42'] })
  const withText = withAdminPing({ content: 'hi' }, '42')
  assertEquals(withText.content, '<@&42> hi')
  // Role not known yet: post without pinging anyone.
  assertEquals(withAdminPing({ content: 'hi' }, null), { content: 'hi', allowed_mentions: { parse: [] } })
})

Deno.test('each alert links to where the admin acts', () => {
  assertEquals(mismatchAlert(m, 1, SITE).embeds![0]!.url, `${SITE}/admin/mismatches/m1`)
  assertEquals(mismatchAlert(m, 1, SITE).embeds![0]!.description!.includes('1 value differs'), true)
  assertEquals(teamPendingAlert({ name: 'Team Vectorize', tag: 'tV', captain: 'jake', players: 4 }, SITE).embeds![0]!.url, `${SITE}/admin/season`)
  assertEquals(disputeAlert(m, 'score', SITE, '123').embeds![0]!.description!.includes('<#123>'), true)
  assertEquals(unreportedAlert(m, SITE).embeds![0]!.url, `${SITE}/matches/m1`)
})

import { assertEquals } from 'jsr:@std/assert@1'
import { ANNOUNCEMENTS, buildAnnouncement, daysUntil, dueOffsets, eventTime, withEveryone, type AnnouncementSeason } from './announcements.ts'

const SITE = 'https://hal.example'
const season: AnnouncementSeason = {
  id: 's1',
  name: 'Season 1',
  status: 'signups',
  signupsOpenAt: '2027-01-04T05:00:00Z',
  startsOn: '2027-02-03', // a Wednesday: week 1 is Monday Feb 1
  regularWeeks: 8,
  playoffTeams: 8,
  matchNights: ['tue', 'thu'],
  matchTime: '21:00:00',
  timezone: 'America/New_York',
  rosterLockAt: '2027-03-15T03:59:00Z',
  maxRosterChanges: 3,
  maxStarters: 4,
  maxSubs: 3,
  prize: '$400 to the champions',
}

Deno.test('dates come from the season settings', () => {
  assertEquals(eventTime('season_countdown', season)!.toISOString(), '2027-02-01T05:00:00.000Z') // Monday midnight ET
  // Playoffs: 8 weeks after week 1, at match time.
  assertEquals(eventTime('playoffs', season)!.toISOString(), '2027-03-30T01:00:00.000Z')
  assertEquals(eventTime('roster_lock', { ...season, rosterLockAt: null }), null)
})

Deno.test('countdown text says the days left, match nights and the roster change rule', () => {
  const now = new Date('2027-01-25T05:00:00Z') // 7 days before
  const a = buildAnnouncement('season_countdown', season, now, SITE)
  const e = a.payload!.embeds![0]!
  assertEquals(e.title, 'Season 1 starts in 7 days')
  assertEquals(e.description!.includes('Tuesday and Thursday at 9:00 PM ET'), true)
  assertEquals(e.description!.includes('**3 roster changes**'), true)
  assertEquals(buildAnnouncement('season_countdown', season, new Date('2027-01-31T06:00:00Z'), SITE).payload!.embeds![0]!.title, 'Season 1 starts tomorrow')
})

Deno.test('missing settings explain what to set', () => {
  const a = buildAnnouncement('roster_lock', { ...season, rosterLockAt: null }, new Date(), SITE)
  assertEquals(a.payload, null)
  assertEquals(a.unavailable, 'Set "Roster lock" in Season settings first.')
})

Deno.test('every announcement fits Discord embed limits', () => {
  for (const { key } of ANNOUNCEMENTS) {
    const e = buildAnnouncement(key, season, new Date('2027-01-10T00:00:00Z'), SITE).payload!.embeds![0]!
    assertEquals((e.title ?? '').length <= 256 && (e.description ?? '').length <= 4096, true, key)
  }
})

Deno.test('automatic posts fire once in their window, never stale', () => {
  const at = new Date('2027-02-01T05:00:00Z')
  assertEquals(dueOffsets('season_countdown', at, new Date('2027-01-25T06:00:00Z')), [7])
  assertEquals(dueOffsets('season_countdown', at, new Date('2027-01-26T06:00:00Z')), []) // 7-day window passed
  assertEquals(dueOffsets('season_countdown', at, new Date('2027-01-31T05:30:00Z')), [1])
  assertEquals(dueOffsets('roster_changes', at, new Date('2027-02-01T06:00:00Z')), [0])
  assertEquals(daysUntil(at, new Date('2027-01-31T06:00:00Z')), 1)
})

Deno.test('@everyone is opt-in', () => {
  assertEquals(withEveryone({ embeds: [] }).allowed_mentions, { parse: ['everyone'] })
})

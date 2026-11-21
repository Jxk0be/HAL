import { assertEquals } from 'jsr:@std/assert@1'
import { formatLeague, mondayOf, remainingWeekDays, RESCHEDULE_TIMES, zonedToUtc } from './time.ts'

Deno.test('Eastern wall time converts to UTC across DST', () => {
  assertEquals(zonedToUtc('2027-03-10', '21:00').toISOString(), '2027-03-11T02:00:00.000Z') // EST (UTC-5): DST starts Mar 14
  assertEquals(zonedToUtc('2027-03-15', '21:00').toISOString(), '2027-03-16T01:00:00.000Z') // EDT, UTC-4
  assertEquals(zonedToUtc('2027-01-06', '18:30').toISOString(), '2027-01-06T23:30:00.000Z')
})

Deno.test('league week runs Monday to Sunday and drops past days', () => {
  assertEquals(mondayOf('2027-03-14'), '2027-03-08') // Sunday belongs to the week before
  const defaultAt = zonedToUtc('2027-03-10', '21:00').toISOString()
  const days = remainingWeekDays(defaultAt, zonedToUtc('2027-03-09', '10:00'))
  assertEquals(days.map((d) => d.date), ['2027-03-09', '2027-03-10', '2027-03-11', '2027-03-12', '2027-03-13', '2027-03-14'])
  assertEquals(days[0]!.label, 'Tue, Mar 9')
})

Deno.test('time choices are 6:00 PM to 11:30 PM in 30-minute steps', () => {
  assertEquals(RESCHEDULE_TIMES.length, 12)
  assertEquals(RESCHEDULE_TIMES[0], { name: '6:00 PM ET', value: '18:00' })
  assertEquals(RESCHEDULE_TIMES[11], { name: '11:30 PM ET', value: '23:30' })
  assertEquals(formatLeague('2027-03-11T02:00:00.000Z'), 'Wed, Mar 10, 9:00 PM ET')
})

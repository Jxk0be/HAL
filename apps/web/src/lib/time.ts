/**
 * Time-zone maths without a library. League times are wall-clock times in the season's time zone
 * (America/New_York); the database stores UTC instants. Everything goes through Intl, so daylight
 * saving time is handled by the browser's time zone data.
 */

export const LEAGUE_TZ = 'America/New_York'

/** Offset of `tz` from UTC at `instant`, in minutes (EST = -300, EDT = -240). */
export function tzOffsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - instant.getTime()) / 60000)
}

/**
 * The UTC instant of a wall-clock time in `tz`. `date` is YYYY-MM-DD, `time` is HH:MM[:SS].
 * Two passes settle the offset across DST boundaries.
 */
export function zonedToUtc(date: string, time: string, tz: string = LEAGUE_TZ): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const [hh, mm, ss = 0] = time.split(':').map(Number) as [number, number, number?]
  const wall = Date.UTC(y, m - 1, d, hh, mm, ss)
  let guess = new Date(wall - tzOffsetMinutes(new Date(wall), tz) * 60000)
  guess = new Date(wall - tzOffsetMinutes(guess, tz) * 60000)
  return guess
}

/** YYYY-MM-DD for a Date's calendar day in UTC (for plain date arithmetic). */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Add days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return isoDate(new Date(Date.UTC(y, m - 1, d + days)))
}

/** Monday (YYYY-MM-DD) of the week containing `date`. */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 // Mon = 0
  return addDays(date, -dow)
}

export const NIGHTS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Night = (typeof NIGHTS)[number]

/** The calendar date (YYYY-MM-DD) and time (HH:MM) of an instant in `tz`. */
export function toZoned(iso: string, tz: string = LEAGUE_TZ): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

/** Format an instant in the league time zone, e.g. "Tue, Jan 12 · 9:00 PM ET". */
export function formatLeagueTime(iso: string, tz: string = LEAGUE_TZ): string {
  const d = new Date(iso)
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d)
  return `${day} · ${time} ET`
}

/** Format an instant in the viewer's own time zone. */
export function formatLocalTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** The league week containing `iso`: Monday 00:00 to the next Monday 00:00 (exclusive) in `tz`. */
export function leagueWeekBounds(iso: string, tz: string = LEAGUE_TZ): { start: Date; end: Date } {
  const monday = mondayOf(toZoned(iso, tz).date)
  return { start: zonedToUtc(monday, '00:00', tz), end: zonedToUtc(addDays(monday, 7), '00:00', tz) }
}

/** The viewer's own time zone (for date-time pickers). */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

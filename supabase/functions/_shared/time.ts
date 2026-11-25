/**
 * League time helpers for the bot (mirrors apps/web/src/lib/time.ts). Wall-clock times in the
 * season's time zone (America/New_York by default) are converted through Intl, so DST is right.
 */
export const LEAGUE_TZ = 'America/New_York'

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

/** The UTC instant of a wall-clock date (YYYY-MM-DD) and time (HH:MM) in `tz`. */
export function zonedToUtc(date: string, time: string, tz: string = LEAGUE_TZ): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const [hh, mm] = time.split(':').map(Number) as [number, number]
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  let guess = new Date(wall - tzOffsetMinutes(new Date(wall), tz) * 60000)
  guess = new Date(wall - tzOffsetMinutes(guess, tz) * 60000)
  return guess
}

/** YYYY-MM-DD of an instant in `tz`. */
export function zonedDate(iso: string | Date, tz: string = LEAGUE_TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Monday of the week containing `date` (YYYY-MM-DD). */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  return addDays(date, -((dow + 6) % 7))
}

/** "Wed, Mar 10" for a YYYY-MM-DD date. */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
}

/** "Wed, Mar 10, 9:00 PM ET" */
export function formatLeague(iso: string, tz: string = LEAGUE_TZ): string {
  return `${new Date(iso).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET`
}

/** Days left in the league week (Monday to Sunday in `tz`) of the match's default time, from today. */
export function remainingWeekDays(defaultAt: string, now: Date, tz: string = LEAGUE_TZ): { date: string; label: string }[] {
  const monday = mondayOf(zonedDate(defaultAt, tz))
  const today = zonedDate(now, tz)
  const out: { date: string; label: string }[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i)
    if (date >= today) out.push({ date, label: dayLabel(date) })
  }
  return out
}

/** 6:00 PM to 11:30 PM in 30-minute steps: { name: '6:00 PM ET', value: '18:00' }. */
export const RESCHEDULE_TIMES: { name: string; value: string }[] = Array.from({ length: 12 }, (_, i) => {
  const minutes = 18 * 60 + i * 30
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return { name: `${h - 12}:${String(m).padStart(2, '0')} PM ET`, value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
})

/** Preseason start times: 12:00 PM to 11:30 PM in 30-minute steps (24 choices; Discord allows 25). */
export const PRESEASON_TIMES: { name: string; value: string }[] = Array.from({ length: 24 }, (_, i) => {
  const minutes = 12 * 60 + i * 30
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const h12 = h === 12 ? 12 : h - 12
  return { name: `${h12}:${String(m).padStart(2, '0')} PM ET`, value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
})

/** The next `n` days from today in `tz` (for /preseason's day picker). */
export function upcomingDays(now: Date, n: number, tz: string = LEAGUE_TZ): { date: string; label: string }[] {
  const today = zonedDate(now, tz)
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i)
    return { date, label: dayLabel(date) }
  })
}

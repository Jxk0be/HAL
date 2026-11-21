/**
 * When each scheduled post is due. Pure, so the timing rules are unit-tested.
 *
 *  reminder_24h  from T-24h until T-1h (skipped if the match was booked later than that)
 *  reminder_1h   from T-1h until the start
 *  checkin       from T-15m until T+30m (the check-in window)
 *  checkin_missing  from the start until T+30m, if the team hasn't checked in
 */
export type Kind = 'reminder_24h' | 'reminder_1h' | 'checkin' | 'checkin_missing'

const MIN = 60_000
const HOUR = 60 * MIN

export function dueKinds(scheduledAt: string, now: number, checkedIn: boolean): Kind[] {
  const t = new Date(scheduledAt).getTime()
  const out: Kind[] = []
  if (now >= t - 24 * HOUR && now < t - HOUR) out.push('reminder_24h')
  if (now >= t - HOUR && now < t) out.push('reminder_1h')
  if (now >= t - 15 * MIN && now < t + 30 * MIN && !checkedIn) out.push('checkin')
  if (now >= t && now < t + 30 * MIN && !checkedIn) out.push('checkin_missing')
  return out
}

/** Window of matches the scheduler needs to look at. */
export function scanWindow(now: number): { from: string; to: string } {
  return { from: new Date(now - 30 * MIN).toISOString(), to: new Date(now + 24 * HOUR + 5 * MIN).toISOString() }
}

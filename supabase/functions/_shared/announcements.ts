/**
 * Season announcements for #announcements, built from the season settings. Pure (no I/O):
 * tested in announcements_test.ts. Used by the admin page (preview / post now, via discord-sync)
 * and by the scheduler (automatic posts a week and a day before each date).
 *
 * Keep the wording in step with rules/rulebook.md (section numbers are quoted).
 */
import type { MessagePayload } from './discord.ts'
import { halEmbed } from './embeds.ts'
import { addDays, mondayOf, zonedToUtc } from './time.ts'

export interface AnnouncementSeason {
  id: string
  name: string
  status: string
  signupsOpenAt: string | null
  /** Regular season start (YYYY-MM-DD); week 1 is the Monday of that week. */
  startsOn: string | null
  regularWeeks: number
  playoffTeams: number
  matchNights: string[]
  /** "21:00:00" */
  matchTime: string
  timezone: string
  rosterLockAt: string | null
  maxRosterChanges: number
  maxStarters: number
  maxSubs: number
  prize: string | null
}

export type AnnouncementKey = 'signups_open' | 'season_countdown' | 'roster_changes' | 'roster_lock' | 'playoffs'

export const ANNOUNCEMENTS: { key: AnnouncementKey; label: string; summary: string }[] = [
  { key: 'signups_open', label: 'Signups are open', summary: 'How to join, build a team and get approved.' },
  { key: 'season_countdown', label: 'Season countdown', summary: 'Days until the regular season, match nights and the roster change rule.' },
  { key: 'roster_changes', label: 'Roster changes now count', summary: 'The regular season started: adds and drops use roster changes.' },
  { key: 'roster_lock', label: 'Roster lock', summary: 'When rosters lock and what that means.' },
  { key: 'playoffs', label: 'Playoffs countdown', summary: 'Days until playoffs, who qualifies and player eligibility.' },
]

/** Automatic posts: days before the date (0 = on the day). */
export const AUTO_OFFSETS: Record<AnnouncementKey, number[]> = {
  signups_open: [0],
  season_countdown: [7, 1],
  roster_changes: [0],
  roster_lock: [7, 1],
  playoffs: [7, 1],
}

const NIGHT_NAMES: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }
const DAY = 86_400_000

const ts = (d: Date, style: 'D' | 'F' | 'R' = 'D') => `<t:${Math.floor(d.getTime() / 1000)}:${style}>`

function nights(s: AnnouncementSeason): string {
  const names = s.matchNights.map((n) => NIGHT_NAMES[n] ?? n)
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? 'match nights')
  const [h = 21, m = 0] = s.matchTime.split(':').map(Number)
  const time = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
  return `${list} at ${time} ET`
}

/** The date each announcement is about, or null when the season doesn't have it set. */
export function eventTime(key: AnnouncementKey, s: AnnouncementSeason): Date | null {
  const time = s.matchTime.slice(0, 5)
  switch (key) {
    case 'signups_open':
      return s.signupsOpenAt ? new Date(s.signupsOpenAt) : null
    case 'season_countdown':
    case 'roster_changes':
      return s.startsOn ? zonedToUtc(mondayOf(s.startsOn), '00:00', s.timezone) : null
    case 'roster_lock':
      return s.rosterLockAt ? new Date(s.rosterLockAt) : null
    case 'playoffs':
      return s.startsOn ? zonedToUtc(addDays(mondayOf(s.startsOn), 7 * s.regularWeeks), time, s.timezone) : null
  }
}

/** Whole days from now until the date (0 = today or passed). */
export function daysUntil(at: Date, now: Date): number {
  return Math.max(0, Math.ceil((at.getTime() - now.getTime()) / DAY))
}

const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`)

export interface AnnouncementPreview {
  key: AnnouncementKey
  label: string
  /** Null when it can be posted; otherwise why not (shown on the admin page). */
  unavailable: string | null
  at: string | null
  payload: MessagePayload | null
}

export function buildAnnouncement(key: AnnouncementKey, s: AnnouncementSeason, now: Date, siteUrl: string): AnnouncementPreview {
  const label = ANNOUNCEMENTS.find((a) => a.key === key)?.label ?? key
  const at = eventTime(key, s)
  if (!at) {
    const missing: Record<AnnouncementKey, string> = {
      signups_open: 'Set "Signups open" in Season settings first.',
      season_countdown: 'Set "Regular season starts" in Season settings first.',
      roster_changes: 'Set "Regular season starts" in Season settings first.',
      roster_lock: 'Set "Roster lock" in Season settings first.',
      playoffs: 'Set "Regular season starts" in Season settings first.',
    }
    return { key, label, unavailable: missing[key], at: null, payload: null }
  }
  const days = daysUntil(at, now)
  const changes = `${s.maxRosterChanges} roster ${s.maxRosterChanges === 1 ? 'change' : 'changes'}`
  const links = `[Rules](${siteUrl}/rules) · [Schedule](${siteUrl}/matches) · [Standings](${siteUrl}/standings)`

  let title = ''
  let lines: string[] = []
  switch (key) {
    case 'signups_open':
      title = `${s.name}: signups are open`
      lines = [
        `Signups ${at.getTime() <= now.getTime() ? 'are open' : `open ${ts(at)} (${ts(at, 'R')})`}. Free entry, NA only, controller only, 18+.`,
        `**Join:** log in on the site with Discord and finish your profile: ${siteUrl}/login`,
        `**Build a team:** create one on the site and invite players. Rosters are up to ${s.maxStarters} starters and ${s.maxSubs} subs (3.2). A team needs **4 players** before admins can approve it (3.5).`,
        `**Need a team?** Press **Post as free agent** in the free agents channel.`,
        s.startsOn ? `The regular season starts ${ts(eventTime('season_countdown', s)!)}. Matches are ${nights(s)}.` : '',
        s.prize ? `**Prize:** ${s.prize}` : '',
      ]
      break
    case 'season_countdown':
      title = days === 0 ? `${s.name} starts today` : `${s.name} starts ${inDays(days)}`
      lines = [
        `The regular season starts ${ts(at)} (${ts(at, 'R')}): ${s.regularWeeks} weeks, matches ${nights(s)}.`,
        `**Get your roster right now.** Building your roster before the season is free. Once it starts, every player added or dropped uses one of your **${changes}** for the season (3.9).`,
        `Players must be on the roster **24 hours before a match** to play in it (4.2).`,
        `Teams still pending need **4 players** to be approved (3.5).`,
      ]
      break
    case 'roster_changes':
      title = days === 0 ? 'Roster changes now count' : `Roster changes start counting ${inDays(days)}`
      lines = [
        `From ${ts(at)} every player added or dropped uses one of your team's **${changes}** for the season (3.9). Check how many you have left on My Team.`,
        `A player who leaves or is dropped can't join another team in the same division for 7 days (3.11).`,
        `Short for one match? Captains can request an **emergency sub** on the match page instead: no roster change used (4.3).`,
      ]
      break
    case 'roster_lock':
      title = days === 0 ? 'Rosters lock today' : `Rosters lock ${inDays(days)}`
      lines = [
        `Rosters lock ${ts(at, 'F')} (${ts(at, 'R')}). After that, no players can be added or dropped except by league staff (3.10).`,
        `Make any last moves before then. Each one uses one of your **${changes}** (3.9), and new players must be on the roster 24 hours before a match to play (4.2).`,
        `Emergency subs for a single match are still allowed after the lock (4.3).`,
      ]
      break
    case 'playoffs':
      title = days === 0 ? 'Playoffs start today' : `Playoffs start ${inDays(days)}`
      lines = [
        `The playoffs start ${ts(at)} (${ts(at, 'R')}). The top **${s.playoffTeams}** teams in the standings qualify.`,
        `To play in the playoffs, a player must have played at least **2 regular-season matches** for their team (5.6).`,
        s.rosterLockAt ? `Rosters lock ${ts(new Date(s.rosterLockAt))} (3.10).` : '',
        s.prize ? `**Prize:** ${s.prize}` : '',
      ]
      break
  }
  return {
    key,
    label,
    unavailable: null,
    at: at.toISOString(),
    payload: {
      embeds: [halEmbed({ title, url: `${siteUrl}/rules`, description: [...lines.filter(Boolean), '', links].join('\n') }, now)],
    },
  }
}

/** Adds an @everyone ping (manual posts only, when the admin ticks it). */
export function withEveryone(payload: MessagePayload): MessagePayload {
  return { ...payload, content: '@everyone', allowed_mentions: { parse: ['everyone'] } }
}

/**
 * Automatic posts due now: an offset fires once, within 12 hours after its moment and before the
 * date itself (so a late-enabled toggle doesn't post a stale "7 days" notice the day before).
 */
export function dueOffsets(key: AnnouncementKey, at: Date, now: Date): number[] {
  return AUTO_OFFSETS[key].filter((days) => {
    const moment = at.getTime() - days * DAY
    const end = days === 0 ? moment + 12 * 3600_000 : Math.min(moment + 12 * 3600_000, at.getTime())
    return now.getTime() >= moment && now.getTime() < end
  })
}

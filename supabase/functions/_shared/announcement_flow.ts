/**
 * Season announcements: load the active season, preview every announcement, post one now (admin
 * page), and post automatic ones when due (scheduler). Texts are in announcements.ts.
 * announcement_posts makes each automatic post happen once (unique season + key + occurrence).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sendMessage } from './discord.ts'
import { loadChannels } from './match_data.ts'
import {
  ANNOUNCEMENTS,
  buildAnnouncement,
  dueOffsets,
  eventTime,
  withEveryone,
  type AnnouncementKey,
  type AnnouncementSeason,
} from './announcements.ts'

export async function loadAnnouncementSeason(db: SupabaseClient): Promise<AnnouncementSeason | null> {
  const { data: s } = await db
    .from('seasons')
    .select('id, name, status, signups_open_at, starts_on, regular_weeks, playoff_teams, match_nights, match_time, timezone, roster_lock_at, max_roster_changes, max_starters, max_subs, prize_text')
    .in('status', ['signups', 'regular', 'playoffs'])
    .maybeSingle()
  if (!s) return null
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    signupsOpenAt: s.signups_open_at,
    startsOn: s.starts_on,
    regularWeeks: s.regular_weeks,
    playoffTeams: s.playoff_teams,
    matchNights: s.match_nights ?? [],
    matchTime: s.match_time ?? '21:00:00',
    timezone: s.timezone ?? 'America/New_York',
    rosterLockAt: s.roster_lock_at,
    maxRosterChanges: s.max_roster_changes,
    maxStarters: s.max_starters,
    maxSubs: s.max_subs,
    prize: s.prize_text,
  }
}

export interface AnnouncementRow {
  key: AnnouncementKey
  label: string
  summary: string
  auto: boolean
  at: string | null
  unavailable: string | null
  /** The embed as it would post right now (for the preview). */
  title: string | null
  description: string | null
  lastPostedAt: string | null
  lastPostedAuto: boolean
}

export async function previewAnnouncements(db: SupabaseClient, siteUrl: string, now = new Date()) {
  const season = await loadAnnouncementSeason(db)
  const channels = await loadChannels(db)
  const { data: settings } = await db.from('announcement_settings').select('key, auto')
  const auto = new Map((settings ?? []).map((r) => [r.key as string, r.auto as boolean]))
  const { data: posts } = season
    ? await db.from('announcement_posts').select('key, occurrence, posted_at').eq('season_id', season.id).order('posted_at', { ascending: false })
    : { data: [] }
  const rows: AnnouncementRow[] = ANNOUNCEMENTS.map(({ key, label, summary }) => {
    const last = (posts ?? []).find((p) => p.key === key)
    if (!season) {
      return { key, label, summary, auto: auto.get(key) ?? false, at: null, unavailable: 'No season is running (signups, regular season or playoffs).', title: null, description: null, lastPostedAt: null, lastPostedAuto: false }
    }
    const a = buildAnnouncement(key, season, now, siteUrl)
    const e = a.payload?.embeds?.[0]
    return {
      key,
      label,
      summary,
      auto: auto.get(key) ?? false,
      at: a.at,
      unavailable: a.unavailable,
      title: e?.title ?? null,
      description: e?.description ?? null,
      lastPostedAt: last?.posted_at ?? null,
      lastPostedAuto: Boolean(last?.occurrence?.startsWith('auto:')),
    }
  })
  return { season: season ? { id: season.id, name: season.name } : null, channelSet: Boolean(channels.announcements), rows }
}

/** Posts one announcement now (admin button). Returns an error message or null. */
export async function postAnnouncementNow(
  db: SupabaseClient,
  key: AnnouncementKey,
  opts: { by: string; everyone: boolean; siteUrl: string },
): Promise<string | null> {
  if (!ANNOUNCEMENTS.some((a) => a.key === key)) return 'Unknown announcement.'
  const channel = (await loadChannels(db)).announcements
  if (!channel) return 'Set the #announcements channel ID on Admin → Discord first.'
  const season = await loadAnnouncementSeason(db)
  if (!season) return 'No season is running.'
  const a = buildAnnouncement(key, season, new Date(), opts.siteUrl)
  if (!a.payload) return a.unavailable ?? 'Nothing to post.'
  const msg = await sendMessage(channel, opts.everyone ? withEveryone(a.payload) : a.payload)
  await db.from('announcement_posts').insert({
    season_id: season.id,
    key,
    occurrence: `manual:${crypto.randomUUID()}`,
    posted_by: opts.by,
    discord_channel_id: channel,
    discord_message_id: msg.id,
  })
  return null
}

/** Scheduler: posts the automatic announcements that are due. Returns how many were posted. */
export async function runAutoAnnouncements(db: SupabaseClient, siteUrl: string, now = new Date()): Promise<number> {
  const { data: settings } = await db.from('announcement_settings').select('key').eq('auto', true)
  if (!settings?.length) return 0
  const channel = (await loadChannels(db)).announcements
  const season = await loadAnnouncementSeason(db)
  if (!channel || !season) return 0
  let posted = 0
  for (const { key } of settings as { key: AnnouncementKey }[]) {
    const at = eventTime(key, season)
    if (!at) continue
    for (const days of dueOffsets(key, at, now)) {
      // Claim first: the unique (season, key, occurrence) means it posts once even if two runs overlap.
      const { data: claim, error } = await db
        .from('announcement_posts')
        .insert({ season_id: season.id, key, occurrence: `auto:${days}d`, discord_channel_id: channel })
        .select('id')
        .single()
      if (error) {
        if (error.code === '23505') continue
        throw error
      }
      const a = buildAnnouncement(key, season, now, siteUrl)
      if (!a.payload) continue
      try {
        const msg = await sendMessage(channel, a.payload)
        await db.from('announcement_posts').update({ discord_message_id: msg.id }).eq('id', claim.id)
        posted++
      } catch (err) {
        await db.from('announcement_posts').delete().eq('id', claim.id)
        throw err
      }
    }
  }
  return posted
}

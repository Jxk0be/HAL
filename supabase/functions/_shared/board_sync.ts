/**
 * Keeps the live board messages in step with the database. Called by discord-scheduler every run.
 *
 * Each family (roster, standings, schedule, subs, potw) computes the messages it wants, keyed
 * ("roster:<teamId>"), and reconcile() posts new ones, edits changed ones (content hash in
 * discord_boards) and deletes ones that are no longer wanted. A family whose channel isn't set in
 * Admin -> Discord is skipped and its old messages are left alone.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { deleteMessage, discordErrorCode, editMessage, sendMessage, UNKNOWN_CHANNEL, UNKNOWN_MESSAGE, type MessagePayload } from './discord.ts'
import {
  boardHash,
  potwPost,
  rosterBoard,
  scheduleBoard,
  standingsBoard,
  subBoard,
  type RosterTeam,
  type ScheduleMatch,
  type StandingRow,
  type SubNeed,
  type WeekPlayer,
} from './boards.ts'
import type { ChannelSettings } from './match_data.ts'
import { queueBoards } from './eights_flow.ts'
import { addDays, dayLabel, mondayOf, zonedDate, zonedToUtc } from './time.ts'

const ACTIVE = ['signups', 'regular', 'playoffs']

export interface Desired {
  key: string
  channelId: string
  payload: MessagePayload
  /** Never deleted once posted (Player of the Week, past weeks' schedules). */
  keep?: boolean
}

interface BoardRow {
  key: string
  channel_id: string
  message_id: string
  content_hash: string
  keep: boolean
}

const gone = (err: unknown) => {
  const code = discordErrorCode(err)
  return code === UNKNOWN_MESSAGE || code === UNKNOWN_CHANNEL
}

/** Post, edit or delete so the family's messages match `desired`. Returns how many changed. */
export async function reconcile(db: SupabaseClient, family: string, desired: Desired[], opts: { removeStale?: boolean } = {}): Promise<number> {
  const { data } = await db.from('discord_boards').select('key, channel_id, message_id, content_hash, keep').like('key', `${family}:%`)
  const existing = new Map(((data ?? []) as BoardRow[]).map((r) => [r.key, r]))
  let changed = 0

  for (const d of desired) {
    const hash = await boardHash(d.payload)
    const row = existing.get(d.key)
    existing.delete(d.key)
    if (row && row.channel_id === d.channelId && row.content_hash === hash) continue

    let messageId: string | null = null
    if (row && row.channel_id === d.channelId) {
      try {
        await editMessage(row.channel_id, row.message_id, d.payload)
        messageId = row.message_id
      } catch (err) {
        if (!gone(err)) throw err // deleted by hand: post it again below
      }
    } else if (row) {
      await deleteMessage(row.channel_id, row.message_id).catch(() => {}) // channel moved
    }
    if (!messageId) messageId = (await sendMessage(d.channelId, d.payload)).id

    await db.from('discord_boards').upsert({
      key: d.key,
      channel_id: d.channelId,
      message_id: messageId,
      content_hash: hash,
      keep: d.keep ?? false,
      updated_at: new Date().toISOString(),
    })
    changed++
  }

  if (opts.removeStale !== false) {
    for (const row of existing.values()) {
      if (row.keep) continue
      await deleteMessage(row.channel_id, row.message_id).catch((err) => {
        if (!gone(err)) throw err
      })
      await db.from('discord_boards').delete().eq('key', row.key)
      changed++
    }
  }
  return changed
}

// ---- Data ------------------------------------------------------------------------------
async function activeSeasons(db: SupabaseClient) {
  const { data } = await db.from('seasons').select('id, name, status, playoff_teams').in('status', ACTIVE)
  return (data ?? []) as { id: string; name: string; status: string; playoff_teams: number | null }[]
}

async function rosterBoards(db: SupabaseClient, channelId: string, siteUrl: string): Promise<Desired[]> {
  const seasons = await activeSeasons(db)
  if (!seasons.length) return []
  const { data, error } = await db
    .from('teams')
    .select(
      'id, name, tag, logo_url, captain_id, co_captain_id, division:divisions(name), ' +
        'members:team_members(user_id, role, joined_at, left_at, is_emergency, profile:profiles(activision_id, discord_username, discord_id))',
    )
    .in('season_id', seasons.map((s) => s.id))
    .eq('status', 'approved')
    .order('name')
  if (error) throw error
  // deno-lint-ignore no-explicit-any
  return ((data ?? []) as any[]).map((t) => {
    const team: RosterTeam = {
      id: t.id,
      name: t.name,
      tag: t.tag,
      logoUrl: t.logo_url,
      division: t.division?.name ?? null,
      players: (t.members ?? [])
        // deno-lint-ignore no-explicit-any
        .filter((m: any) => !m.left_at && !m.is_emergency)
        // deno-lint-ignore no-explicit-any
        .sort((a: any, b: any) => String(a.joined_at).localeCompare(String(b.joined_at)))
        // deno-lint-ignore no-explicit-any
        .map((m: any) => ({
          name: m.profile?.activision_id ?? m.profile?.discord_username ?? 'Player',
          discordId: m.profile?.discord_id ?? null,
          role: m.role,
          captain: m.user_id === t.captain_id,
          coCaptain: m.user_id === t.co_captain_id,
        })),
    }
    return { key: `roster:${t.id}`, channelId, payload: rosterBoard(team, siteUrl) }
  })
}

async function standingsBoards(db: SupabaseClient, channelId: string, siteUrl: string): Promise<Desired[]> {
  const seasons = (await activeSeasons(db)).filter((s) => s.status !== 'signups')
  const out: Desired[] = []
  for (const s of seasons) {
    const { data: divisions } = await db.from('divisions').select('id, name').eq('season_id', s.id).order('tier').order('name')
    for (const d of divisions ?? []) {
      const { data: rows, error } = await db.rpc('division_standings', { p_season_id: s.id, p_division_id: d.id })
      if (error) throw error
      // deno-lint-ignore no-explicit-any
      const table: StandingRow[] = ((rows ?? []) as any[]).map((r) => ({
        rank: r.rank,
        tag: r.tag,
        name: r.name,
        wins: r.wins,
        losses: r.losses,
        mapsWon: r.maps_won,
        mapsLost: r.maps_lost,
      }))
      out.push({
        key: `standings:${d.id}`,
        channelId,
        payload: standingsBoard({ divisionName: d.name, seasonName: s.name, rows: table, playoffTeams: s.playoff_teams }, siteUrl),
      })
    }
  }
  return out
}

/** This league week's matches (Monday to Sunday, league time), one message per season and week number. */
async function scheduleBoards(db: SupabaseClient, channelId: string, siteUrl: string, now: Date): Promise<Desired[]> {
  const seasons = (await activeSeasons(db)).filter((s) => s.status !== 'signups')
  if (!seasons.length) return []
  const monday = mondayOf(zonedDate(now))
  const from = zonedToUtc(monday, '00:00').toISOString()
  const to = zonedToUtc(addDays(monday, 7), '00:00').toISOString()
  const { data, error } = await db
    .from('matches')
    .select(
      'id, season_id, week, scheduled_at, status, home_series, away_series, division:divisions(name), ' +
        'home:teams!matches_home_team_id_fkey(name, tag), away:teams!matches_away_team_id_fkey(name, tag)',
    )
    .in('season_id', seasons.map((s) => s.id))
    .neq('stage', 'preseason') // preseason (week 0) has its own channels; this board is the league weeks
    .gte('scheduled_at', from)
    .lt('scheduled_at', to)
  if (error) throw error
  const groups = new Map<string, { season: string; week: number; matches: ScheduleMatch[] }>()
  // deno-lint-ignore no-explicit-any
  for (const m of (data ?? []) as any[]) {
    const key = `schedule:${m.season_id}:${m.week}`
    const g = groups.get(key) ?? { season: seasons.find((s) => s.id === m.season_id)?.name ?? 'Season', week: m.week as number, matches: [] as ScheduleMatch[] }
    g.matches.push({
      id: m.id,
      scheduledAt: m.scheduled_at,
      status: m.status,
      home: m.home,
      away: m.away,
      homeSeries: m.home_series,
      awaySeries: m.away_series,
      division: m.division?.name ?? null,
    })
    groups.set(key, g)
  }
  // keep: once the week is over its message stays as a record instead of being deleted.
  return [...groups].map(([key, g]) => ({
    key,
    channelId,
    keep: true,
    payload: scheduleBoard({ seasonName: g.season, week: g.week, matches: g.matches }, siteUrl),
  }))
}

export async function loadSubNeeds(db: SupabaseClient): Promise<SubNeed[]> {
  const { data, error } = await db.rpc('sub_board')
  if (error) throw error
  // deno-lint-ignore no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    matchId: r.match_id,
    teamId: r.team_id,
    teamName: r.team_name,
    teamTag: r.team_tag,
    opponentName: r.opponent_name,
    opponentTag: r.opponent_tag,
    scheduledAt: r.scheduled_at,
    needed: r.needed,
    // deno-lint-ignore no-explicit-any
    volunteers: ((r.volunteers ?? []) as any[]).map((v) => ({ userId: v.user_id, discordId: v.discord_id ?? null, name: v.name ?? 'Player' })),
  }))
}

async function subBoards(db: SupabaseClient, channelId: string, siteUrl: string): Promise<Desired[]> {
  return (await loadSubNeeds(db)).map((n) => ({ key: `subs:${n.matchId}:${n.teamId}`, channelId, payload: subBoard(n, siteUrl) }))
}

/**
 * Player of the Week for last week (Monday to Sunday, league time), posted once from Monday noon.
 * Nothing is posted for a week without confirmed results.
 */
async function potwBoards(db: SupabaseClient, channelId: string, siteUrl: string, now: Date): Promise<Desired[]> {
  if (!(await activeSeasons(db)).some((s) => s.status !== 'signups')) return []
  const thisMonday = mondayOf(zonedDate(now))
  if (now < zonedToUtc(thisMonday, '12:00')) return []
  const lastMonday = addDays(thisMonday, -7)
  const { data, error } = await db.rpc('week_top_players', {
    p_from: zonedToUtc(lastMonday, '00:00').toISOString(),
    p_to: zonedToUtc(thisMonday, '00:00').toISOString(),
    p_limit: 3,
  })
  if (error) throw error
  // deno-lint-ignore no-explicit-any
  const players: WeekPlayer[] = ((data ?? []) as any[]).map((r) => ({
    discordId: r.discord_id ?? null,
    name: r.name,
    teamTag: r.team_tag ?? null,
    maps: r.maps,
    kills: r.kills,
    deaths: r.deaths,
    kd: Number(r.kd),
    avgScore: r.avg_score,
  }))
  const payload = potwPost({ weekLabel: `Week of ${dayLabel(lastMonday)}`, players }, siteUrl)
  return payload ? [{ key: `potw:${lastMonday}`, channelId, payload, keep: true }] : []
}

/** Runs every board family whose channel is set. Errors in one family don't stop the others. */
export async function syncBoards(
  db: SupabaseClient,
  channels: ChannelSettings,
  siteUrl: string,
  now: Date,
  onError: (family: string, err: unknown) => Promise<void>,
): Promise<Record<string, number>> {
  const families: [string, string | null, () => Promise<Desired[]>, { removeStale?: boolean }?][] = [
    ['roster', channels.rosters, () => rosterBoards(db, channels.rosters!, siteUrl)],
    ['standings', channels.standings, () => standingsBoards(db, channels.standings!, siteUrl)],
    ['schedule', channels.schedule, () => scheduleBoards(db, channels.schedule!, siteUrl, now)],
    ['subs', channels.subs, () => subBoards(db, channels.subs!, siteUrl)],
    // Only ever adds: an old week's post is never touched again.
    ['potw', channels.potw, () => potwBoards(db, channels.potw!, siteUrl, now), { removeStale: false }],
    // The 8s queue post in #lf-8s (also redrawn straight away on every join and leave).
    ['eights', channels.eights, () => queueBoards(db, channels.eights!)],
  ]
  const stats: Record<string, number> = {}
  for (const [family, channelId, build, opts] of families) {
    if (!channelId) continue
    try {
      const n = await reconcile(db, family, await build(), opts)
      if (n) stats[`board_${family}`] = n
    } catch (err) {
      await onError(`board_${family}`, err)
    }
  }
  return stats
}

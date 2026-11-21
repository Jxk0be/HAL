/**
 * Database reads and bot_events bookkeeping shared by discord-scheduler and the check-in buttons.
 * Service-role client only.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { MsgMatch, MsgTeam } from './match_messages.ts'

export interface BotTeam extends MsgTeam {
  channelId: string | null
  captainDiscordIds: string[]
}

export interface BotMatch extends MsgMatch {
  status: string
  homeSeries: number | null
  awaySeries: number | null
  winnerTeamId: string | null
  forfeitTeamId: string | null
  broadcastUrl: string | null
  broadcastBy: string | null
  home: BotTeam
  away: BotTeam
}

export const MATCH_COLUMNS =
  'id, week, status, scheduled_at, home_series, away_series, winner_team_id, forfeit_team_id, broadcast_url, broadcast_by, ' +
  'home:teams!matches_home_team_id_fkey(id, name, tag, discord_channel_id, captain:profiles!teams_captain_id_fkey(discord_id), co:profiles!teams_co_captain_id_fkey(discord_id)), ' +
  'away:teams!matches_away_team_id_fkey(id, name, tag, discord_channel_id, captain:profiles!teams_captain_id_fkey(discord_id), co:profiles!teams_co_captain_id_fkey(discord_id))'

// deno-lint-ignore no-explicit-any
function toTeam(t: any): BotTeam {
  return {
    id: t.id,
    name: t.name,
    tag: t.tag,
    channelId: t.discord_channel_id ?? null,
    captainDiscordIds: [t.captain?.discord_id, t.co?.discord_id].filter((x): x is string => Boolean(x)),
  }
}

// deno-lint-ignore no-explicit-any
export function toBotMatch(m: any): BotMatch {
  return {
    id: m.id,
    week: m.week,
    status: m.status,
    scheduledAt: m.scheduled_at,
    homeSeries: m.home_series,
    awaySeries: m.away_series,
    winnerTeamId: m.winner_team_id,
    forfeitTeamId: m.forfeit_team_id,
    broadcastUrl: m.broadcast_url,
    broadcastBy: m.broadcast_by,
    home: toTeam(m.home),
    away: toTeam(m.away),
  }
}

export async function loadMatch(db: SupabaseClient, id: string): Promise<BotMatch | null> {
  const { data, error } = await db.from('matches').select(MATCH_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? toBotMatch(data) : null
}

export interface ChannelSettings {
  lfg: string | null
  disputes: string | null
  results: string | null
  announcements: string | null
  admin: string | null
}

/** The HAL Admin role id (stored by discord-sync in app_settings.discord), for admin pings. */
export async function loadAdminRoleId(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.from('app_settings').select('value').eq('key', 'discord').maybeSingle()
  // deno-lint-ignore no-explicit-any
  return ((data?.value as any)?.roles?.admin as string | undefined) ?? null
}

export async function loadChannels(db: SupabaseClient): Promise<ChannelSettings> {
  const { data } = await db.from('app_settings').select('value').eq('key', 'discord_channels').maybeSingle()
  const v = (data?.value ?? {}) as Partial<Record<keyof ChannelSettings, string>>
  return { lfg: v.lfg || null, disputes: v.disputes || null, results: v.results || null, announcements: v.announcements || null, admin: v.admin || null }
}

/** Claim a post before sending it. Returns the event id, or null if it was already claimed. */
export async function claimEvent(db: SupabaseClient, matchId: string, teamId: string | null, kind: string): Promise<number | null> {
  const { data, error } = await db.from('bot_events').insert({ match_id: matchId, team_id: teamId, kind }).select('id').single()
  if (error) {
    if (error.code === '23505') return null
    throw error
  }
  return data.id as number
}

export async function recordEvent(db: SupabaseClient, id: number, channelId: string, messageId: string) {
  await db.from('bot_events').update({ discord_channel_id: channelId, discord_message_id: messageId }).eq('id', id)
}

/** Release a claim so the next run retries (the post failed). */
export async function releaseEvent(db: SupabaseClient, id: number) {
  await db.from('bot_events').delete().eq('id', id)
}

export async function findEvent(db: SupabaseClient, matchId: string, teamId: string | null, kind: string) {
  let q = db.from('bot_events').select('id, discord_channel_id, discord_message_id').eq('match_id', matchId).eq('kind', kind)
  q = teamId ? q.eq('team_id', teamId) : q.is('team_id', null)
  const { data } = await q.maybeSingle()
  return data as { id: number; discord_channel_id: string | null; discord_message_id: string | null } | null
}

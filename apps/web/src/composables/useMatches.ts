import { computed, ref, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useRealtime } from './useRealtime'
import { playerName } from '@/lib/players'
import type { Database } from '@/types/database'

type MatchStatus = Database['public']['Enums']['match_status']

export interface MatchTeam {
  id: string
  name: string
  tag: string
  logoUrl: string | null
}

export interface MatchCardData {
  id: string
  seasonId: string
  divisionId: string | null
  week: number
  stage: 'regular' | 'playoff'
  playoffRound: number | null
  status: MatchStatus
  scheduledAt: string
  defaultAt: string
  home: MatchTeam
  away: MatchTeam
  homeSeries: number | null
  awaySeries: number | null
  winnerTeamId: string | null
  forfeitTeamId: string | null
  broadcastLive: boolean
  broadcastUrl: string | null
}

export const MATCH_SELECT =
  'id, season_id, division_id, week, stage, playoff_round, status, scheduled_at, default_at, home_series, away_series, winner_team_id, forfeit_team_id, broadcast_live, broadcast_url, home:teams!matches_home_team_id_fkey(id, name, tag, logo_url), away:teams!matches_away_team_id_fkey(id, name, tag, logo_url)'

type MatchRow = {
  id: string
  season_id: string
  division_id: string | null
  week: number
  stage: 'regular' | 'playoff'
  playoff_round: number | null
  status: MatchStatus
  scheduled_at: string
  default_at: string
  home_series: number | null
  away_series: number | null
  winner_team_id: string | null
  forfeit_team_id: string | null
  broadcast_live: boolean
  broadcast_url: string | null
  home: { id: string; name: string; tag: string; logo_url: string | null }
  away: { id: string; name: string; tag: string; logo_url: string | null }
}

export function toMatchCard(m: MatchRow): MatchCardData {
  const team = (t: MatchRow['home']): MatchTeam => ({ id: t.id, name: t.name, tag: t.tag, logoUrl: t.logo_url })
  return {
    id: m.id,
    seasonId: m.season_id,
    divisionId: m.division_id,
    week: m.week,
    stage: m.stage,
    playoffRound: m.playoff_round,
    status: m.status,
    scheduledAt: m.scheduled_at,
    defaultAt: m.default_at,
    home: team(m.home),
    away: team(m.away),
    homeSeries: m.home_series,
    awaySeries: m.away_series,
    winnerTeamId: m.winner_team_id,
    forfeitTeamId: m.forfeit_team_id,
    broadcastLive: m.broadcast_live,
    broadcastUrl: m.broadcast_url,
  }
}

/** The week to show by default: the week of the next unfinished match, else the last week played. */
export function currentWeek(matches: MatchCardData[], now = Date.now()): number {
  const upcoming = matches
    .filter((m) => m.stage === 'regular' && new Date(m.scheduledAt).getTime() > now - 3 * 3600_000)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0]
  if (upcoming) return upcoming.week
  return Math.max(1, ...matches.filter((m) => m.stage === 'regular').map((m) => m.week))
}

/** Every match of the active season, live-updated. Small enough (≈130 rows) to filter client-side. */
export function useSeasonSchedule() {
  const season = ref<{ id: string; name: string; status: string; regular_weeks: number; starts_on: string | null; timezone: string } | null>(null)
  const matches = ref<MatchCardData[]>([])
  const loading = ref(true)

  async function load() {
    const { data: s } = await supabase
      .from('seasons')
      .select('id, name, status, regular_weeks, starts_on, timezone')
      .in('status', ['signups', 'regular', 'playoffs'])
      .maybeSingle()
    season.value = s
    if (s) {
      const { data } = await supabase.from('matches').select(MATCH_SELECT).eq('season_id', s.id).order('scheduled_at')
      matches.value = ((data ?? []) as unknown as MatchRow[]).map(toMatchCard)
    } else {
      matches.value = []
    }
    loading.value = false
  }

  useRealtime('schedule', [{ table: 'matches' }], load)
  void load()
  return { season, matches, loading, reload: load }
}

// ---- Match detail ---------------------------------------------------------------
export interface MapPlayerLine {
  userId: string
  teamId: string
  name: string
  kills: number
  deaths: number
  score: number
}
export interface MatchMapDetail {
  id: string
  number: number
  mode: string
  map: string
  homeScore: number | null
  awayScore: number | null
  winnerTeamId: string | null
  players: MapPlayerLine[]
}

export function useMatchDetail(id: MaybeRefOrGetter<string | null | undefined>) {
  const auth = useAuthStore()
  const match = ref<MatchCardData | null>(null)
  const maps = ref<MatchMapDetail[]>([])
  const screenshots = ref<{ path: string; url: string; teamId: string }[]>([])
  const checkins = ref<{ teamId: string; at: string; players: number }[]>([])
  const dispute = ref<{ status: string; reason: string; resolution: string | null } | null>(null)
  const loading = ref(true)

  async function load() {
    const matchId = toValue(id)
    if (!matchId) return
    const { data } = await supabase.from('matches').select(MATCH_SELECT).eq('id', matchId).maybeSingle()
    match.value = data ? toMatchCard(data as unknown as MatchRow) : null
    if (!match.value) {
      loading.value = false
      return
    }

    const statsSelect = auth.isSignedIn
      ? 'id, map_number, home_score, away_score, winner_team_id, mode:game_modes(name), map:maps(name), stats:player_map_stats(user_id, team_id, kills, deaths, score, profile:profiles(activision_id, discord_username))'
      : 'id, map_number, home_score, away_score, winner_team_id, mode:game_modes(name), map:maps(name), stats:player_map_stats(user_id, team_id, kills, deaths, score, profile:profiles(activision_id))'
    const [{ data: mm }, { data: subs }, { data: ci }, { data: d }] = await Promise.all([
      supabase.from('match_maps').select(statsSelect).eq('match_id', matchId).order('map_number'),
      auth.isSignedIn
        ? supabase.from('report_submissions').select('team_id, screenshot_paths').eq('match_id', matchId)
        : Promise.resolve({ data: [] as { team_id: string; screenshot_paths: string[] }[] }),
      auth.isSignedIn
        ? supabase.from('checkins').select('team_id, checked_in_at, player_ids').eq('match_id', matchId)
        : Promise.resolve({ data: [] as { team_id: string; checked_in_at: string; player_ids: string[] }[] }),
      supabase.from('disputes_public').select('status, reason, resolution').eq('match_id', matchId).order('created_at', { ascending: false }).limit(1),
    ])

    maps.value = ((mm ?? []) as unknown as {
      id: string
      map_number: number
      home_score: number | null
      away_score: number | null
      winner_team_id: string | null
      mode: { name: string } | null
      map: { name: string } | null
      stats: { user_id: string; team_id: string; kills: number; deaths: number; score: number; profile: { activision_id: string | null; discord_username?: string | null } | null }[]
    }[]).map((x) => ({
      id: x.id,
      number: x.map_number,
      mode: x.mode?.name ?? 'Mode',
      map: x.map?.name ?? 'Map',
      homeScore: x.home_score,
      awayScore: x.away_score,
      winnerTeamId: x.winner_team_id,
      players: x.stats
        .map((s) => ({
          userId: s.user_id,
          teamId: s.team_id,
          name: playerName({ discordUsername: s.profile?.discord_username, activisionId: s.profile?.activision_id }),
          kills: s.kills,
          deaths: s.deaths,
          score: s.score,
        }))
        .sort((a, b) => b.score - a.score),
    }))

    // Screenshots: RLS only returns submissions to the two teams and staff; show via signed URLs.
    const paths = (subs ?? []).flatMap((s) => s.screenshot_paths.map((p) => ({ path: p, teamId: s.team_id })))
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('screenshots').createSignedUrls(paths.map((p) => p.path), 3600)
      screenshots.value = paths
        .map((p, i) => ({ ...p, url: signed?.[i]?.signedUrl ?? '' }))
        .filter((p) => p.url)
    } else {
      screenshots.value = []
    }
    checkins.value = (ci ?? []).map((c) => ({ teamId: c.team_id, at: c.checked_in_at, players: c.player_ids.length }))
    dispute.value = d?.[0] ? { status: d[0].status ?? 'open', reason: d[0].reason ?? '', resolution: d[0].resolution } : null
    loading.value = false
  }

  const filter = computed(() => toValue(id))
  useRealtime('match', [{ table: 'matches' }, { table: 'match_maps' }], () => void load())
  watch([filter, () => auth.isSignedIn], load, { immediate: true })
  return { match, maps, screenshots, checkins, dispute, loading, reload: load }
}

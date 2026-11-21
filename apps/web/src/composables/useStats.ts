import { ref, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { supabase } from '@/lib/supabase'
import { useRealtime } from './useRealtime'
import type { Database } from '@/types/database'

export type StandingRow = Database['public']['Functions']['division_standings']['Returns'][number]
export type PlayerStatRow = Database['public']['Views']['player_season_stats_v']['Row']

/** Standings for a division (null = whole league), live-updated. */
export function useStandings(
  seasonId: MaybeRefOrGetter<string | null | undefined>,
  divisionId: MaybeRefOrGetter<string | null | undefined>,
) {
  const rows = ref<StandingRow[]>([])
  const loading = ref(true)
  async function load() {
    const s = toValue(seasonId)
    if (!s) {
      rows.value = []
      loading.value = false
      return
    }
    const { data } = await supabase.rpc('division_standings', {
      p_season_id: s,
      p_division_id: toValue(divisionId) ?? undefined,
    })
    rows.value = data ?? []
    loading.value = false
  }
  useRealtime('standings', [{ table: 'matches' }], () => void load(), 1500)
  watch([() => toValue(seasonId), () => toValue(divisionId)], load, { immediate: true })
  return { rows, loading, reload: load }
}

/** Divisions of a season (empty = one league table). */
export function useDivisions(seasonId: MaybeRefOrGetter<string | null | undefined>) {
  const divisions = ref<{ id: string; name: string; tier: number }[]>([])
  async function load() {
    const s = toValue(seasonId)
    if (!s) return
    const { data } = await supabase.from('divisions').select('id, name, tier').eq('season_id', s).order('tier')
    divisions.value = data ?? []
  }
  watch(() => toValue(seasonId), load, { immediate: true })
  return { divisions }
}

export type LeaderboardKey = 'kd' | 'kills' | 'avg_score'

/** Top qualified players (≥40% of their team's maps) for each leaderboard. */
export function useLeaderboards(seasonId: MaybeRefOrGetter<string | null | undefined>, limit = 10) {
  const boards = ref<Record<LeaderboardKey, PlayerStatRow[]>>({ kd: [], kills: [], avg_score: [] })
  const loading = ref(true)
  async function load() {
    const s = toValue(seasonId)
    if (!s) {
      loading.value = false
      return
    }
    const q = (col: LeaderboardKey) =>
      supabase
        .from('player_season_stats_v')
        .select('*')
        .eq('season_id', s)
        .eq('qualifies', true)
        .order(col, { ascending: false, nullsFirst: false })
        .limit(limit)
    const [kd, kills, avg] = await Promise.all([q('kd'), q('kills'), q('avg_score')])
    boards.value = { kd: kd.data ?? [], kills: kills.data ?? [], avg_score: avg.data ?? [] }
    loading.value = false
  }
  watch(() => toValue(seasonId), load, { immediate: true })
  return { boards, loading, reload: load }
}

/** One player's season line (all their seasons, newest first). */
export function usePlayerStats(userId: MaybeRefOrGetter<string | null | undefined>) {
  const rows = ref<PlayerStatRow[]>([])
  const history = ref<{ matchId: string; scheduledAt: string; opponent: string; won: boolean | null; kills: number; deaths: number; maps: number }[]>([])
  async function load() {
    const id = toValue(userId)
    if (!id) return
    const [{ data: stats }, { data: lines }] = await Promise.all([
      supabase.from('player_season_stats_v').select('*').eq('user_id', id),
      supabase
        .from('player_map_stats')
        .select(
          'team_id, kills, deaths, map:match_maps!inner(match:matches!inner(id, status, scheduled_at, winner_team_id, home:teams!matches_home_team_id_fkey(id, name), away:teams!matches_away_team_id_fkey(id, name)))',
        )
        .eq('user_id', id),
    ])
    rows.value = stats ?? []
    const byMatch = new Map<string, (typeof history.value)[number]>()
    for (const l of (lines ?? []) as unknown as {
      team_id: string
      kills: number
      deaths: number
      map: { match: { id: string; status: string; scheduled_at: string; winner_team_id: string | null; home: { id: string; name: string }; away: { id: string; name: string } } }
    }[]) {
      const m = l.map.match
      if (m.status !== 'confirmed') continue
      const entry = byMatch.get(m.id) ?? {
        matchId: m.id,
        scheduledAt: m.scheduled_at,
        opponent: m.home.id === l.team_id ? m.away.name : m.home.name,
        won: m.winner_team_id ? m.winner_team_id === l.team_id : null,
        kills: 0,
        deaths: 0,
        maps: 0,
      }
      entry.kills += l.kills
      entry.deaths += l.deaths
      entry.maps += 1
      byMatch.set(m.id, entry)
    }
    history.value = [...byMatch.values()].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
  }
  watch(() => toValue(userId), load, { immediate: true })
  return { rows, history }
}

/** A team's regular-season series record (from match_results_v). */
export function useTeamRecord(teamId: MaybeRefOrGetter<string | null | undefined>) {
  const record = ref({ wins: 0, losses: 0, mapsWon: 0, mapsLost: 0 })
  async function load() {
    const id = toValue(teamId)
    if (!id) return
    const { data } = await supabase.from('match_results_v').select('won, maps_won, maps_lost').eq('team_id', id).eq('stage', 'regular')
    const rows = data ?? []
    record.value = {
      wins: rows.filter((r) => r.won).length,
      losses: rows.filter((r) => r.won === false).length,
      mapsWon: rows.reduce((s, r) => s + (r.maps_won ?? 0), 0),
      mapsLost: rows.reduce((s, r) => s + (r.maps_lost ?? 0), 0),
    }
  }
  useRealtime('team-record', [{ table: 'matches' }], () => void load(), 1500)
  watch(() => toValue(teamId), load, { immediate: true })
  return { record }
}

/** A team's mode records for a season. */
export function useTeamModeRecords(teamId: MaybeRefOrGetter<string | null | undefined>) {
  const records = ref<{ mode: string; wins: number; losses: number }[]>([])
  async function load() {
    const id = toValue(teamId)
    if (!id) return
    const { data } = await supabase.from('team_mode_records_v').select('mode_name, wins, losses').eq('team_id', id).order('mode_name')
    records.value = (data ?? []).map((r) => ({ mode: r.mode_name ?? 'Mode', wins: r.wins ?? 0, losses: r.losses ?? 0 }))
  }
  watch(() => toValue(teamId), load, { immediate: true })
  return { records }
}

// ---- Audit log --------------------------------------------------------------------
export type AuditRow = Database['public']['Views']['audit_log_public']['Row']

export function useAuditLog(pageSize = 30) {
  const rows = ref<AuditRow[]>([])
  const page = ref(0)
  const total = ref(0)
  const loading = ref(true)
  const table = ref<string>('')
  async function load() {
    loading.value = true
    let q = supabase.from('audit_log_public').select('*', { count: 'exact' })
    if (table.value) q = q.eq('table_name', table.value)
    const { data, count } = await q.order('id', { ascending: false }).range(page.value * pageSize, page.value * pageSize + pageSize - 1)
    rows.value = data ?? []
    total.value = count ?? 0
    loading.value = false
  }
  watch(table, () => {
    page.value = 0
    void load()
  })
  watch(page, load, { immediate: true })
  return { rows, page, total, table, loading, pages: () => Math.max(1, Math.ceil(total.value / pageSize)) }
}

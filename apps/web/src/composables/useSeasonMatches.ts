import { ref, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { supabase } from '@/lib/supabase'
import { dbErrorMessage } from '@/lib/errors'
import type { Result as StandingsResult } from '@/lib/standings'
import type { Database } from '@/types/database'

export interface AdminMatch {
  id: string
  divisionId: string | null
  week: number
  stage: Database['public']['Enums']['match_stage']
  playoffRound: number | null
  homeTeamId: string
  awayTeamId: string
  defaultAt: string
  scheduledAt: string
  status: Database['public']['Enums']['match_status']
  winnerTeamId: string | null
}

export interface NewMatch {
  division_id: string | null
  week: number
  stage?: 'regular' | 'playoff' | 'preseason'
  playoff_round?: number | null
  home_team_id: string
  away_team_id: string
  default_at: string
}

type Result = { ok: true; count?: number } | { ok: false; message: string }

/** All matches of a season (for the schedule and playoff tabs), plus results for standings. */
export function useSeasonMatches(seasonId: MaybeRefOrGetter<string | null | undefined>) {
  const matches = ref<AdminMatch[]>([])
  const results = ref<(StandingsResult & { divisionId: string | null })[]>([])
  const loading = ref(true)
  const busy = ref(false)

  async function load() {
    const id = toValue(seasonId)
    if (!id) {
      matches.value = []
      results.value = []
      loading.value = false
      return
    }
    loading.value = true
    const { data } = await supabase
      .from('matches')
      .select(
        'id, division_id, week, stage, playoff_round, home_team_id, away_team_id, default_at, scheduled_at, status, winner_team_id, maps:match_maps(map_number, home_score, away_score)',
      )
      .eq('season_id', id)
      .order('scheduled_at')
    matches.value = (data ?? []).map((m) => ({
      id: m.id,
      divisionId: m.division_id,
      week: m.week,
      stage: m.stage,
      playoffRound: m.playoff_round,
      homeTeamId: m.home_team_id,
      awayTeamId: m.away_team_id,
      defaultAt: m.default_at,
      scheduledAt: m.scheduled_at,
      status: m.status,
      winnerTeamId: m.winner_team_id,
    }))
    results.value = (data ?? [])
      .filter((m) => m.stage === 'regular' && (m.status === 'confirmed' || m.status === 'forfeit'))
      .map((m) => ({
        divisionId: m.division_id,
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        winnerTeamId: m.winner_team_id,
        maps: m.maps
          .filter((x) => x.home_score !== null && x.away_score !== null)
          .map((x) => ({ number: x.map_number, homeScore: x.home_score ?? 0, awayScore: x.away_score ?? 0 })),
      }))
    loading.value = false
  }

  async function createMatches(rows: NewMatch[], replace: boolean): Promise<Result> {
    const id = toValue(seasonId)
    if (!id) return { ok: false, message: 'No season.' }
    busy.value = true
    const { data, error } = await supabase.rpc('create_matches', {
      p_season_id: id,
      p_matches: rows as unknown as Database['public']['Functions']['create_matches']['Args']['p_matches'],
      p_replace: replace,
    })
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error, 'Could not save the schedule.') }
    await load()
    return { ok: true, count: data ?? 0 }
  }

  /** Edit one match (recused: RLS hides matches involving the editor's own team). */
  async function updateMatch(
    matchId: string,
    patch: { week?: number; home_team_id?: string; away_team_id?: string; scheduled_at?: string; default_at?: string; status?: AdminMatch['status'] },
  ): Promise<Result> {
    busy.value = true
    const { data, error } = await supabase.from('matches').update(patch).eq('id', matchId).select('id')
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error, 'Could not save the match.') }
    if (!data?.length) return { ok: false, message: "This match involves your team, so another admin has to edit it." }
    await load()
    return { ok: true }
  }

  watch(() => toValue(seasonId), load, { immediate: true })
  return { matches, results, loading, busy, reload: load, createMatches, updateMatch }
}

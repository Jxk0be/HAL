import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { supabase } from '@/lib/supabase'
import { useRealtime } from './useRealtime'
import type { BracketMatchIn } from '@/lib/bracket'

export interface PlayoffSeason {
  id: string
  name: string
  status: string
  playoffTeams: number
}

/** The season the Playoffs page shows: the running one, else the most recent. */
export function usePlayoffSeason() {
  const season = ref<PlayoffSeason | null>(null)
  const loading = ref(true)
  async function load() {
    const { data } = await supabase
      .from('seasons')
      .select('id, name, status, playoff_teams, starts_on')
      .neq('status', 'draft')
      .order('starts_on', { ascending: false })
      .limit(5)
    const rows = data ?? []
    const pick = rows.find((s) => ['signups', 'regular', 'playoffs'].includes(s.status)) ?? rows[0] ?? null
    season.value = pick ? { id: pick.id, name: pick.name, status: pick.status, playoffTeams: pick.playoff_teams } : null
    loading.value = false
  }
  void load()
  return { season, loading }
}

/** A division's playoff matches (null division = whole league) plus regular-season seeds. */
export function usePlayoffMatches(seasonId: MaybeRefOrGetter<string | null | undefined>, divisionId: MaybeRefOrGetter<string | null | undefined>) {
  const matches = ref<BracketMatchIn[]>([])
  const seeds = ref<Record<string, number>>({})
  const loading = ref(true)

  async function load() {
    const s = toValue(seasonId)
    if (!s) {
      matches.value = []
      loading.value = false
      return
    }
    const d = toValue(divisionId)
    let q = supabase
      .from('matches')
      .select(
        'id, playoff_round, scheduled_at, status, home_series, away_series, winner_team_id, ' +
          'home:teams!matches_home_team_id_fkey(id, tag, name, logo_url), away:teams!matches_away_team_id_fkey(id, tag, name, logo_url)',
      )
      .eq('season_id', s)
      .eq('stage', 'playoff')
      .neq('status', 'cancelled')
    q = d ? q.eq('division_id', d) : q
    const [{ data }, { data: table }] = await Promise.all([
      q,
      supabase.rpc('division_standings', { p_season_id: s, p_division_id: d ?? undefined }),
    ])
    type Row = {
      id: string
      playoff_round: number | null
      scheduled_at: string
      status: string
      home_series: number | null
      away_series: number | null
      winner_team_id: string | null
      home: { id: string; tag: string; name: string; logo_url: string | null }
      away: { id: string; tag: string; name: string; logo_url: string | null }
    }
    const team = (t: Row['home']) => ({ id: t.id, tag: t.tag, name: t.name, logoUrl: t.logo_url })
    matches.value = ((data ?? []) as unknown as Row[]).map((m) => ({
      id: m.id,
      round: m.playoff_round ?? 1,
      scheduledAt: m.scheduled_at,
      status: m.status,
      home: team(m.home),
      away: team(m.away),
      homeSeries: m.home_series,
      awaySeries: m.away_series,
      winnerTeamId: m.winner_team_id,
    }))
    seeds.value = Object.fromEntries((table ?? []).map((r) => [r.team_id, r.rank]))
    loading.value = false
  }

  useRealtime('playoffs', [{ table: 'matches' }], () => void load(), 1500)
  watch([() => toValue(seasonId), () => toValue(divisionId)], load, { immediate: true })
  return { matches, seeds, loading, reload: load }
}

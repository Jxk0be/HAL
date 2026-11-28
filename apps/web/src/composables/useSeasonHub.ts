import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

const HUB_COLUMNS =
  'id, name, status, signups_open_at, starts_on, regular_weeks, matches_per_week, playoff_teams, match_nights, match_time, timezone, roster_lock_at, max_roster, max_starters, max_subs, max_roster_changes, prize_text, banner_url'

export type HubSeason = Pick<
  Database['public']['Tables']['seasons']['Row'],
  | 'id'
  | 'name'
  | 'status'
  | 'signups_open_at'
  | 'starts_on'
  | 'regular_weeks'
  | 'matches_per_week'
  | 'playoff_teams'
  | 'match_nights'
  | 'match_time'
  | 'timezone'
  | 'roster_lock_at'
  | 'max_roster'
  | 'max_starters'
  | 'max_subs'
  | 'max_roster_changes'
  | 'prize_text'
  | 'banner_url'
>

export interface HubDivision {
  id: string
  name: string
  teams: number
}

/** Teams a single division holds (rule: up to 16, then split). */
export const DIVISION_CAPACITY = 16

/**
 * The season hub: one season (by id, else the running one, else the most recent published one),
 * the list of published seasons for the switcher, and its divisions with approved-team counts.
 */
export function useSeasonHub(seasonId: MaybeRefOrGetter<string | null | undefined>) {
  const season = ref<HubSeason | null>(null)
  const seasons = ref<{ id: string; name: string; status: string }[]>([])
  const divisions = ref<HubDivision[]>([])
  const approvedTeams = ref(0)
  const loading = ref(true)
  const notFound = ref(false)

  async function load() {
    loading.value = true
    notFound.value = false
    const wanted = toValue(seasonId)
    const { data: list } = await supabase
      .from('seasons')
      .select('id, name, status, starts_on')
      .neq('status', 'draft')
      .order('starts_on', { ascending: false, nullsFirst: true })
    seasons.value = (list ?? []).map((s) => ({ id: s.id, name: s.name, status: s.status }))
    const pickId =
      wanted ??
      (list ?? []).find((s) => ['signups', 'regular', 'playoffs'].includes(s.status))?.id ??
      list?.[0]?.id ??
      null
    if (!pickId) {
      season.value = null
      loading.value = false
      return
    }
    const [{ data: s }, { data: divs }, { data: teams }] = await Promise.all([
      supabase.from('seasons').select(HUB_COLUMNS).eq('id', pickId).maybeSingle(),
      supabase.from('divisions').select('id, name, tier').eq('season_id', pickId).order('tier'),
      supabase.from('teams').select('id, division_id').eq('season_id', pickId).eq('status', 'approved'),
    ])
    season.value = s
    notFound.value = Boolean(wanted) && !s
    approvedTeams.value = teams?.length ?? 0
    divisions.value = (divs ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      teams: (teams ?? []).filter((t) => t.division_id === d.id).length,
    }))
    loading.value = false
  }

  const capacity = computed(() => DIVISION_CAPACITY * Math.max(1, divisions.value.length))

  watch(() => toValue(seasonId), load, { immediate: true })
  return { season, seasons, divisions, approvedTeams, capacity, loading, notFound, reload: load }
}

import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

const SEASON_COLUMNS =
  'id, name, status, starts_on, max_roster, max_starters, max_subs, max_roster_changes, roster_lock_at, match_nights, match_time, timezone, playoff_teams, regular_weeks'

export type ActiveSeason = Pick<
  Database['public']['Tables']['seasons']['Row'],
  | 'id'
  | 'name'
  | 'status'
  | 'starts_on'
  | 'max_roster'
  | 'max_starters'
  | 'max_subs'
  | 'max_roster_changes'
  | 'roster_lock_at'
  | 'match_nights'
  | 'match_time'
  | 'timezone'
  | 'playoff_teams'
  | 'regular_weeks'
>

/** The season in signups, regular season or playoffs (at most one exists). */
export function useActiveSeason() {
  const season = ref<ActiveSeason | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    const { data, error: err } = await supabase
      .from('seasons')
      .select(SEASON_COLUMNS)
      .in('status', ['signups', 'regular', 'playoffs'])
      .maybeSingle()
    season.value = data
    error.value = err ? 'Could not load the current season.' : null
    loading.value = false
  }

  void load()
  return { season, loading, error, reload: load }
}

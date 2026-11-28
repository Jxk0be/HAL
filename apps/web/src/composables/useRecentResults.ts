import { effectScope, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { MATCH_SELECT, toMatchCard, type MatchCardData } from './useMatches'
import { useRealtime } from './useRealtime'

// One shared list and one realtime channel for the whole app (the results ticker).
const results = ref<MatchCardData[]>([])
const loaded = ref(false)
let started = false

async function loadResults() {
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .in('status', ['signups', 'regular', 'playoffs'])
    .maybeSingle()
  if (!season) {
    results.value = []
    loaded.value = true
    return
  }
  const { data } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('season_id', season.id)
    .in('status', ['confirmed', 'forfeit'])
    .neq('stage', 'preseason')
    .order('scheduled_at', { ascending: false })
    .limit(20)
  results.value = (data ?? []).map(toMatchCard)
  loaded.value = true
}

/** The last 20 confirmed or forfeited matches of the active season (preseason excluded). */
export function useRecentResults() {
  if (!started) {
    started = true
    // Detached scope: the subscription lives as long as the app, not the first component.
    effectScope(true).run(() => useRealtime('recent-results', [{ table: 'matches' }], () => void loadResults(), 500))
    void loadResults()
  }
  return { results, loaded, reload: loadResults }
}

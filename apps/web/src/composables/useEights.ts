import { onScopeDispose, ref, watch } from 'vue'
import { useDocumentVisibility } from '@vueuse/core'
import { supabase } from '@/lib/supabase'

export interface EightsMatch {
  id: string
  number: number
  status?: 'voting' | 'live'
  mode: string | null
  map: string | null
  vote_ends_at?: string | null
  created_at?: string
  resolved_at?: string
  winner?: 'a' | 'b'
  team_a: string[]
  team_b: string[]
}
export interface EightsLeader {
  user_id: string
  name: string
  wins: number
  losses: number
  played: number
  win_pct: number
}
export interface EightsState {
  queue_count: number
  queue: string[]
  live: EightsMatch[]
  recent: EightsMatch[]
  leaderboard: EightsLeader[]
}

const POLL_MS = 15_000

/**
 * The public 8s state (queue size, live matches, results, leaderboard). The 8s tables aren't in the
 * realtime publication, so this polls every 15 seconds while the tab is visible.
 */
export function useEights() {
  const state = ref<EightsState | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const visibility = useDocumentVisibility()
  let timer: ReturnType<typeof setInterval> | undefined

  async function load() {
    const { data, error: err } = await supabase.rpc('eights_public_state')
    loading.value = false
    if (err) {
      error.value = 'Could not load 8s right now.'
      return
    }
    error.value = null
    state.value = data as unknown as EightsState
  }

  function start() {
    clearInterval(timer)
    timer = setInterval(() => void load(), POLL_MS)
  }
  watch(
    visibility,
    (v) => {
      if (v === 'visible') {
        void load()
        start()
      } else clearInterval(timer)
    },
    { immediate: true },
  )
  onScopeDispose(() => clearInterval(timer))
  return { state, loading, error, reload: load }
}

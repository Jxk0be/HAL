import { ref, watch, type Ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { supabase } from '@/lib/supabase'
import type { Platform } from '@/lib/teams'
import { playerName } from '@/lib/players'

export interface FreeAgentResult {
  id: string
  name: string
  avatarUrl: string | null
  activisionId: string | null
  platform: Platform | null
}

/** Debounced search of the free agent board by Discord name (signed in) or Activision ID. */
export function useFreeAgentSearch(query: Ref<string>, limit = 8) {
  const results = ref<FreeAgentResult[]>([])
  const loading = ref(false)

  async function search(raw: string) {
    const q = raw.trim()
    if (q.length < 2) {
      results.value = []
      loading.value = false
      return
    }
    loading.value = true
    const { data } = await supabase.rpc('free_agent_board', { p_search: q, p_limit: limit })
    if (raw !== query.value) return // a newer search is on its way
    results.value = (data ?? []).map((r) => ({
      id: r.id,
      name: playerName({ discordUsername: r.discord_username, activisionId: r.activision_id }),
      avatarUrl: r.avatar_url,
      activisionId: r.activision_id,
      platform: r.platform,
    }))
    loading.value = false
  }

  watch(query, (q) => {
    if (q.trim().length >= 2) loading.value = true
  })
  watchDebounced(query, search, { debounce: 250 })
  return { results, loading, search: () => search(query.value) }
}

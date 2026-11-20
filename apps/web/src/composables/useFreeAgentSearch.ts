import { ref, watch, type Ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { supabase } from '@/lib/supabase'
import type { Platform } from '@/lib/teams'

export interface FreeAgentResult {
  id: string
  name: string
  avatarUrl: string | null
  activisionId: string | null
  platform: Platform | null
  profileComplete: boolean
}

/** Characters that would break a PostgREST or() filter, plus LIKE wildcards. */
const UNSAFE = /[,()%_*\\.:"']/g

/** Debounced search of the free agent list by Discord name or Activision ID. */
export function useFreeAgentSearch(query: Ref<string>, limit = 8) {
  const results = ref<FreeAgentResult[]>([])
  const loading = ref(false)

  async function search(raw: string) {
    const q = raw.replace(UNSAFE, ' ').trim()
    if (q.length < 2) {
      results.value = []
      loading.value = false
      return
    }
    loading.value = true
    const { data } = await supabase
      .from('free_agents')
      .select('id, discord_username, avatar_url, activision_id, platform, profile_complete')
      .or(`discord_username.ilike.*${q}*,activision_id.ilike.*${q}*`)
      .order('discord_username')
      .limit(limit)
    if (raw !== query.value) return // a newer search is on its way
    results.value = (data ?? []).flatMap((r) =>
      r.id
        ? [
            {
              id: r.id,
              name: r.discord_username ?? 'Player',
              avatarUrl: r.avatar_url,
              activisionId: r.activision_id,
              platform: r.platform,
              profileComplete: Boolean(r.profile_complete),
            },
          ]
        : [],
    )
    loading.value = false
  }

  watch(query, (q) => {
    if (q.trim().length >= 2) loading.value = true
  })
  watchDebounced(query, search, { debounce: 250 })
  return { results, loading, search: () => search(query.value) }
}

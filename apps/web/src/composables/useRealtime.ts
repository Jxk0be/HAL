import { onScopeDispose } from 'vue'
import { supabase } from '@/lib/supabase'

/**
 * Re-run `onChange` when rows in the given tables change (Supabase realtime). Calls are debounced
 * so a burst of updates (e.g. a match plus its maps being confirmed) triggers one reload.
 */
export function useRealtime(
  name: string,
  tables: { table: 'matches' | 'match_maps'; filter?: string }[],
  onChange: () => void,
  debounceMs = 400,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const fire = () => {
    clearTimeout(timer)
    timer = setTimeout(onChange, debounceMs)
  }
  let channel = supabase.channel(`${name}-${Math.random().toString(36).slice(2, 8)}`)
  for (const t of tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: t.table, filter: t.filter }, fire)
  }
  channel.subscribe()
  onScopeDispose(() => {
    clearTimeout(timer)
    void supabase.removeChannel(channel)
  })
}

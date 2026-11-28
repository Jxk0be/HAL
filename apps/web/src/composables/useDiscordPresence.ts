import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { supabase } from '@/lib/supabase'

/**
 * Which of a team's players are in the league Discord server (team_discord_presence(): the team's
 * own players and admins only; anyone else gets nothing). in_server null = not checked yet.
 */
export function useTeamDiscordPresence(teamId: MaybeRefOrGetter<string | null | undefined>) {
  const status = ref(new Map<string, boolean | null>())
  const loading = ref(true)

  async function load() {
    const id = toValue(teamId)
    if (!id) {
      status.value = new Map()
      loading.value = false
      return
    }
    const { data } = await supabase.rpc('team_discord_presence', { p_team_id: id })
    status.value = new Map((data ?? []).map((r) => [r.user_id, r.in_server]))
    loading.value = false
  }

  watch(() => toValue(teamId), () => {
    loading.value = true
    void load()
  }, { immediate: true })
  return { status, loading, reload: load }
}

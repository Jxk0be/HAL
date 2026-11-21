import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

export interface SyncStats {
  teams: number
  users: number
  rolesAdded: number
  rolesRemoved: number
  notInServer: number
  errors: number
}

export interface SyncError {
  id: number
  action: string
  error: string
  createdAt: string
}

/** Owner tools for Discord role sync: full resync and the latest sync errors. */
export function useDiscordSync() {
  const running = ref(false)
  const lastStats = ref<SyncStats | null>(null)
  const errors = ref<SyncError[]>([])
  const loadingErrors = ref(true)

  async function loadErrors() {
    loadingErrors.value = true
    const { data } = await supabase
      .from('discord_sync_errors')
      .select('id, action, error, created_at')
      .order('id', { ascending: false })
      .limit(20)
    errors.value = (data ?? []).map((e) => ({ id: e.id, action: e.action, error: e.error, createdAt: e.created_at }))
    loadingErrors.value = false
  }

  async function resync(): Promise<{ ok: true; stats: SyncStats } | { ok: false; message: string }> {
    running.value = true
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; stats?: SyncStats; error?: string }>(
      'discord-sync',
      { body: { action: 'full_resync' } },
    )
    running.value = false
    await loadErrors()
    if (error || !data?.ok || !data.stats) {
      return { ok: false, message: data?.error ?? 'The resync failed. Check the errors below.' }
    }
    lastStats.value = data.stats
    return { ok: true, stats: data.stats }
  }

  void loadErrors()
  return { running, lastStats, errors, loadingErrors, resync, reloadErrors: loadErrors }
}

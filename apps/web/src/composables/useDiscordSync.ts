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

export interface BotChannels {
  lfg: string
  disputes: string
  results: string
  announcements: string
  admin: string
}

/** Channel IDs the bot posts to (#results, #announcements, #admin-only). Owner edits. */
export function useBotChannels() {
  const channels = ref<BotChannels>({ lfg: '', disputes: '', results: '', announcements: '', admin: '' })
  const loading = ref(true)
  const saving = ref(false)

  async function load() {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'discord_channels').maybeSingle()
    const v = (data?.value ?? {}) as Partial<BotChannels>
    channels.value = { lfg: v.lfg ?? '', disputes: v.disputes ?? '', results: v.results ?? '', announcements: v.announcements ?? '', admin: v.admin ?? '' }
    loading.value = false
  }

  async function save(next: BotChannels): Promise<{ ok: true } | { ok: false; message: string }> {
    const clean = Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.trim()])) as unknown as BotChannels
    if (Object.values(clean).some((v) => v && !/^\d{17,20}$/.test(v))) {
      return { ok: false, message: 'Channel IDs are 17 to 20 digits. In Discord, turn on Developer Mode, then right-click a channel → Copy Channel ID.' }
    }
    saving.value = true
    const { error } = await supabase.from('app_settings').upsert({ key: 'discord_channels', value: { ...clean } })
    saving.value = false
    if (error) return { ok: false, message: "Couldn't save. Only the owner can change these." }
    channels.value = clean
    return { ok: true }
  }

  void load()
  return { channels, loading, saving, save }
}

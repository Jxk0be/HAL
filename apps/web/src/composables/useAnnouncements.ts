import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { dbErrorMessage } from '@/lib/errors'

/**
 * Admin → Announcements. The bot builds each announcement from the season settings
 * (supabase/functions/_shared/announcements.ts) and returns the preview; posting goes through the
 * same function so the preview and the Discord post always match. Admins toggle which ones post
 * automatically (a week and a day before each date).
 */
export interface AnnouncementRow {
  key: string
  label: string
  summary: string
  auto: boolean
  at: string | null
  unavailable: string | null
  title: string | null
  description: string | null
  lastPostedAt: string | null
  lastPostedAuto: boolean
}

type Result = { ok: true } | { ok: false; message: string }

export function useAnnouncements() {
  const rows = ref<AnnouncementRow[]>([])
  const season = ref<{ id: string; name: string } | null>(null)
  const channelSet = ref(true)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const busyKey = ref<string | null>(null)

  async function load() {
    const { data, error: err } = await supabase.functions.invoke<{
      ok: boolean
      season: { id: string; name: string } | null
      channelSet: boolean
      rows: AnnouncementRow[]
    }>('discord-sync', { body: { action: 'announcements_preview' } })
    loading.value = false
    if (err || !data?.ok) {
      error.value = 'Could not load the announcements. Check Admin → Health.'
      return
    }
    error.value = null
    rows.value = data.rows
    season.value = data.season
    channelSet.value = data.channelSet
  }

  async function post(key: string, everyone: boolean): Promise<Result> {
    busyKey.value = key
    const { data, error: err } = await supabase.functions.invoke<{ ok: boolean; error?: string }>('discord-sync', {
      body: { action: 'announcement_post', key, everyone },
    })
    busyKey.value = null
    if (err || !data?.ok) return { ok: false, message: data?.error ?? "Couldn't post. Check Admin → Health." }
    await load()
    return { ok: true }
  }

  /** Posts pasted text to #announcements as an announcement embed. */
  async function postCustom(text: string, everyone: boolean): Promise<Result> {
    busyKey.value = 'custom'
    const { data, error: err } = await supabase.functions.invoke<{ ok: boolean; error?: string }>('discord-sync', {
      body: { action: 'announcement_custom', text, everyone },
    })
    busyKey.value = null
    if (err || !data?.ok) return { ok: false, message: data?.error ?? "Couldn't post. Check Admin → Health." }
    return { ok: true }
  }

  async function setAuto(key: string, auto: boolean): Promise<Result> {
    busyKey.value = key
    const { error: err } = await supabase.from('announcement_settings').update({ auto }).eq('key', key)
    busyKey.value = null
    if (err) return { ok: false, message: dbErrorMessage(err) }
    const row = rows.value.find((r) => r.key === key)
    if (row) row.auto = auto
    return { ok: true }
  }

  void load()
  return { rows, season, channelSet, loading, error, busyKey, post, postCustom, setAuto, reload: load }
}

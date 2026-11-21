import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { dbErrorMessage } from '@/lib/errors'

export interface GameMode {
  id: string
  name: string
  sortOrder: number
  active: boolean
}
export interface GameMap {
  id: string
  name: string
  active: boolean
}

type Result = { ok: true } | { ok: false; message: string }

/** Game modes, maps and which maps are legal in which mode (owner and admins edit). */
export function useGameData() {
  const modes = ref<GameMode[]>([])
  const maps = ref<GameMap[]>([])
  /** "mapId:modeId" pairs that are legal. */
  const legal = ref(new Set<string>())
  const loading = ref(true)
  const busy = ref(false)
  const TAKEN = 'That name is already in the list.'

  async function load() {
    loading.value = true
    const [m, mp, mm] = await Promise.all([
      supabase.from('game_modes').select('id, name, sort_order, active').order('sort_order').order('name'),
      supabase.from('maps').select('id, name, active').order('name'),
      supabase.from('map_modes').select('map_id, mode_id'),
    ])
    modes.value = (m.data ?? []).map((x) => ({ id: x.id, name: x.name, sortOrder: x.sort_order, active: x.active }))
    maps.value = mp.data ?? []
    legal.value = new Set((mm.data ?? []).map((x) => `${x.map_id}:${x.mode_id}`))
    loading.value = false
  }

  async function run(fn: () => PromiseLike<{ error: { code?: string; message: string } | null }>, unique?: string): Promise<Result> {
    busy.value = true
    const { error } = await fn()
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error, undefined, unique) }
    await load()
    return { ok: true }
  }

  /**
   * Adds a map to a mode's pool by name. Reuses an existing map with that name (reactivating it if
   * it was retired), otherwise creates it, so one map can be in several modes.
   */
  async function addMapToMode(modeId: string, rawName: string): Promise<Result> {
    const name = rawName.trim()
    if (!name) return { ok: false, message: 'Enter a map name.' }
    busy.value = true
    try {
      const existing = maps.value.find((m) => m.name.toLowerCase() === name.toLowerCase())
      let mapId = existing?.id
      if (!mapId) {
        const { data, error } = await supabase.from('maps').insert({ name }).select('id').single()
        if (error || !data) return { ok: false, message: dbErrorMessage(error, undefined, TAKEN) }
        mapId = data.id
      } else if (existing && !existing.active) {
        const { error } = await supabase.from('maps').update({ active: true }).eq('id', mapId)
        if (error) return { ok: false, message: dbErrorMessage(error) }
      }
      if (legal.value.has(`${mapId}:${modeId}`)) return { ok: false, message: `${existing?.name ?? name} is already in this mode.` }
      const { error } = await supabase.from('map_modes').insert({ map_id: mapId, mode_id: modeId })
      if (error) return { ok: false, message: dbErrorMessage(error, undefined, 'That map is already in this mode.') }
      return { ok: true }
    } finally {
      busy.value = false
      await load()
    }
  }

  /** Maps in a mode's pool, alphabetical. */
  const mapsInMode = (modeId: string) => maps.value.filter((m) => legal.value.has(`${m.id}:${modeId}`))

  return {
    addMapToMode,
    mapsInMode,
    modes,
    maps,
    legal,
    loading,
    busy,
    load,
    addMode: (name: string) =>
      run(() => supabase.from('game_modes').insert({ name: name.trim(), sort_order: modes.value.length + 1 }), TAKEN),
    updateMode: (id: string, patch: { name?: string; active?: boolean; sort_order?: number }) =>
      run(() => supabase.from('game_modes').update(patch).eq('id', id), TAKEN),
    addMap: (name: string) => run(() => supabase.from('maps').insert({ name: name.trim() }), TAKEN),
    updateMap: (id: string, patch: { name?: string; active?: boolean }) =>
      run(() => supabase.from('maps').update(patch).eq('id', id), TAKEN),
    setLegal: (mapId: string, modeId: string, on: boolean) =>
      run(() =>
        on
          ? supabase.from('map_modes').insert({ map_id: mapId, mode_id: modeId })
          : supabase.from('map_modes').delete().eq('map_id', mapId).eq('mode_id', modeId),
      ),
  }
}

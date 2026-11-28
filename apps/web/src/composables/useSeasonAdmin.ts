import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { dbErrorMessage } from '@/lib/errors'
import { compressImage } from '@/lib/image'
import type { Database } from '@/types/database'

type SeasonRow = Database['public']['Tables']['seasons']['Row']
export type SeasonStatus = Database['public']['Enums']['season_status']
export type SeasonPatch = Partial<
  Pick<
    SeasonRow,
    | 'name'
    | 'status'
    | 'signups_open_at'
    | 'starts_on'
    | 'regular_weeks'
    | 'matches_per_week'
    | 'match_nights'
    | 'match_time'
    | 'timezone'
    | 'roster_lock_at'
    | 'playoff_teams'
    | 'prize_text'
    | 'banner_url'
  >
>

export interface AdminTeam {
  id: string
  name: string
  tag: string
  status: Database['public']['Enums']['team_status']
  divisionId: string | null
  rosterSize: number
  captainName: string
  reviewNote: string | null
  createdAt: string
}

export interface Division {
  id: string
  name: string
  tier: number
}

type Result = { ok: true } | { ok: false; message: string }

/** The season being set up (the active one, else the newest), its divisions and its teams. */
export function useSeasonAdmin() {
  const season = ref<SeasonRow | null>(null)
  const divisions = ref<Division[]>([])
  const teams = ref<AdminTeam[]>([])
  const loading = ref(true)
  const busy = ref(false)

  async function load() {
    loading.value = true
    const { data: seasons } = await supabase
      .from('seasons')
      .select('*')
      .order('created_at', { ascending: false })
    const active = (seasons ?? []).find((s) => ['signups', 'regular', 'playoffs'].includes(s.status))
    season.value = active ?? seasons?.[0] ?? null
    if (season.value) await Promise.all([loadDivisions(season.value.id), loadTeams(season.value.id)])
    loading.value = false
  }

  async function loadDivisions(seasonId: string) {
    const { data } = await supabase.from('divisions').select('id, name, tier').eq('season_id', seasonId).order('tier')
    divisions.value = data ?? []
  }

  async function loadTeams(seasonId: string) {
    const { data } = await supabase
      .from('teams')
      .select(
        'id, name, tag, status, division_id, review_note, created_at, captain:profiles!teams_captain_id_fkey(discord_username, activision_id), members:team_members(left_at, is_emergency)',
      )
      .eq('season_id', seasonId)
      .order('created_at')
    teams.value = (data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      tag: t.tag,
      status: t.status,
      divisionId: t.division_id,
      rosterSize: t.members.filter((m) => !m.left_at && !m.is_emergency).length,
      captainName: t.captain?.discord_username ?? t.captain?.activision_id ?? 'Unknown',
      reviewNote: t.review_note,
      createdAt: t.created_at,
    }))
  }

  async function run(fn: () => PromiseLike<{ error: { code?: string; message: string } | null }>, fallback?: string): Promise<Result> {
    busy.value = true
    const { error } = await fn()
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error, fallback) }
    return { ok: true }
  }

  /** Owner: starts a new season as a draft (every setting has a default; edit them next, then open signups). */
  async function createSeason(rawName: string): Promise<Result> {
    const name = rawName.trim()
    if (!name) return { ok: false, message: 'Give the season a name.' }
    const r = await run(
      () => supabase.from('seasons').insert({ name, status: 'draft' }),
      "Couldn't create the season. Only the owner can, and the name has to be new.",
    )
    if (r.ok) await load()
    return r
  }

  async function saveSeason(patch: SeasonPatch): Promise<Result> {
    if (!season.value) return { ok: false, message: 'No season to save.' }
    const id = season.value.id
    const r = await run(
      () => supabase.from('seasons').update(patch).eq('id', id),
      'Could not save the season. Only one season can be in signups, regular season or playoffs at a time.',
    )
    if (r.ok) await load()
    return r
  }

  /** Owner only: compress (WebP, 1920px max) and upload a banner to season-media, then save its URL. */
  async function uploadBanner(file: File): Promise<Result> {
    if (!season.value) return { ok: false, message: 'No season.' }
    const id = season.value.id
    busy.value = true
    let blob: Blob
    let ext: string
    try {
      ;({ blob, ext } = await compressImage(file, 1920))
    } catch {
      busy.value = false
      return { ok: false, message: 'Could not read that image. Use a PNG, JPG or WebP.' }
    }
    const path = `${id}/banner-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('season-media').upload(path, blob, {
      contentType: blob.type || `image/${ext}`,
      upsert: false,
    })
    busy.value = false
    if (error) return { ok: false, message: 'Could not upload the banner. Only the owner can, and it must be under 3 MB.' }
    const { data } = supabase.storage.from('season-media').getPublicUrl(path)
    return saveSeason({ banner_url: data.publicUrl })
  }

  async function addDivision(name: string): Promise<Result> {
    if (!season.value) return { ok: false, message: 'No season.' }
    const tier = (divisions.value.at(-1)?.tier ?? 0) + 1
    const seasonId = season.value.id
    const r = await run(() => supabase.from('divisions').insert({ season_id: seasonId, name: name.trim(), tier }), 'Could not add the division (names must be unique).')
    if (r.ok) await loadDivisions(seasonId)
    return r
  }

  async function renameDivision(id: string, name: string): Promise<Result> {
    const r = await run(() => supabase.from('divisions').update({ name: name.trim() }).eq('id', id))
    if (r.ok && season.value) await loadDivisions(season.value.id)
    return r
  }

  /** Premier (tier 1) and Contender (tier 2), for more than 16 approved teams. */
  async function splitDivisions(): Promise<Result> {
    if (!season.value) return { ok: false, message: 'No season.' }
    const seasonId = season.value.id
    const existing = new Set(divisions.value.map((d) => d.name.toLowerCase()))
    const rows = [
      { season_id: seasonId, name: 'Premier', tier: 1 },
      { season_id: seasonId, name: 'Contender', tier: 2 },
    ].filter((d) => !existing.has(d.name.toLowerCase()))
    if (rows.length === 0) return { ok: true }
    const r = await run(() => supabase.from('divisions').insert(rows))
    if (r.ok) await loadDivisions(seasonId)
    return r
  }

  /** Staff writes to a team; RLS hides teams the staff member plays on, so 0 rows means recused. */
  async function updateTeam(teamId: string, patch: { status?: AdminTeam['status']; division_id?: string | null; review_note?: string | null }): Promise<Result> {
    busy.value = true
    const { data, error } = await supabase.from('teams').update(patch).eq('id', teamId).select('id')
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error) }
    if (!data?.length) {
      return { ok: false, message: "You're on this team, so another admin has to make this change." }
    }
    if (season.value) await loadTeams(season.value.id)
    return { ok: true }
  }

  const pending = computed(() => teams.value.filter((t) => t.status === 'pending'))
  const approved = computed(() => teams.value.filter((t) => t.status === 'approved'))

  void load()
  return {
    season,
    divisions,
    teams,
    pending,
    approved,
    loading,
    busy,
    reload: load,
    saveSeason,
    uploadBanner,
    createSeason,
    addDivision,
    renameDivision,
    splitDivisions,
    updateTeam,
  }
}

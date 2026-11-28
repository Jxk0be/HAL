import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { supabase } from '@/lib/supabase'
import { dbErrorMessage } from '@/lib/errors'
import { compressImage } from '@/lib/image'
import { playerName } from '@/lib/players'
import {
  emptyMap,
  emptyRows,
  fromSubmission,
  screenshotPath,
  toPayload,
  type MismatchSummary,
  type ReportMap,
} from '@/lib/reporting'
import { useAuthStore } from '@/stores/auth'
import type { Json } from '@/types/database'
import { MATCH_SELECT, toMatchCard, type MatchCardData } from './useMatches'
import { useRealtime } from './useRealtime'

export interface RosterOption {
  userId: string
  teamId: string
  name: string
  sub: boolean
}

export interface ReportStatus {
  status: MatchCardData['status']
  resultSource: 'double_entry' | 'single_report' | 'admin' | 'forfeit' | null
  homeReportedAt: string | null
  awayReportedAt: string | null
  mismatches: MismatchSummary[]
}

type Result<T = void> = { ok: true; value: T } | { ok: false; message: string }

export function parseReportStatus(json: unknown): ReportStatus | null {
  if (!json || typeof json !== 'object') return null
  const j = json as Record<string, unknown>
  return {
    status: j.status as ReportStatus['status'],
    resultSource: (j.result_source as ReportStatus['resultSource']) ?? null,
    homeReportedAt: (j.home_reported_at as string | null) ?? null,
    awayReportedAt: (j.away_reported_at as string | null) ?? null,
    mismatches: Array.isArray(j.mismatches) ? (j.mismatches as MismatchSummary[]) : [],
  }
}

/** Report status for a party to the match (which sides reported, which fields mismatched). */
export function useReportStatus(matchId: MaybeRefOrGetter<string | null | undefined>) {
  const auth = useAuthStore()
  const status = ref<ReportStatus | null>(null)
  const loading = ref(true)

  async function load() {
    const id = toValue(matchId)
    if (!id || !auth.isSignedIn) {
      status.value = null
      loading.value = false
      return
    }
    const { data } = await supabase.rpc('my_match_report_status', { p_match_id: id })
    status.value = parseReportStatus(data)
    loading.value = false
  }

  useRealtime('report-status', [{ table: 'matches' }, { table: 'match_maps' }], () => void load())
  watch([() => toValue(matchId), () => auth.isSignedIn], load, { immediate: true })
  return { status, loading, reload: load }
}

const draftKey = (matchId: string, teamId: string) => `hal:report-draft:${matchId}:${teamId}`

function readDraft(matchId: string, teamId: string): ReportMap[] | null {
  try {
    const raw = localStorage.getItem(draftKey(matchId, teamId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { maps?: ReportMap[] }
    return Array.isArray(parsed.maps) ? parsed.maps : null
  } catch {
    return null
  }
}

/** Everything the captain report form needs, plus upload and submit. */
export function useReport(matchId: MaybeRefOrGetter<string | null | undefined>, prefillId?: MaybeRefOrGetter<string | null | undefined>) {
  const auth = useAuthStore()
  const match = ref<MatchCardData | null>(null)
  const myTeamId = ref<string | null>(null)
  const roster = ref<RosterOption[]>([])
  const maps = ref<ReportMap[]>([])
  const submittedAt = ref<string | null>(null)
  const restoredDraft = ref(false)
  /** The form was prefilled from a Discord /report draft. */
  const fromDiscord = ref(false)
  const previews = ref<Record<string, string>>({})
  const loading = ref(true)
  const submitting = ref(false)
  const uploading = ref<number | null>(null)
  const { status, reload: reloadStatus } = useReportStatus(matchId)

  const sides = computed(() =>
    match.value ? { homeTeamId: match.value.home.id, awayTeamId: match.value.away.id } : null,
  )

  async function signPreviews(paths: string[]) {
    const missing = paths.filter((p) => !previews.value[p])
    if (!missing.length) return
    const { data } = await supabase.storage.from('screenshots').createSignedUrls(missing, 3600)
    const next = { ...previews.value }
    data?.forEach((d, i) => {
      const path = missing[i]
      if (path && d.signedUrl) next[path] = d.signedUrl
    })
    previews.value = next
  }

  async function load() {
    const id = toValue(matchId)
    if (!id || !auth.isSignedIn) {
      loading.value = false
      return
    }
    loading.value = true
    const [{ data: m }, { data: team }] = await Promise.all([
      supabase.from('matches').select(MATCH_SELECT).eq('id', id).maybeSingle(),
      supabase.rpc('match_captain_team', { p_match_id: id }),
    ])
    match.value = m ? toMatchCard(m as unknown as Parameters<typeof toMatchCard>[0]) : null
    myTeamId.value = (team as string | null) ?? null
    const s = sides.value
    if (!match.value || !s || !myTeamId.value) {
      loading.value = false
      return
    }

    const prefill = toValue(prefillId)
    const [{ data: members }, { data: checkins }, { data: mine }, { data: discordDraft }] = await Promise.all([
      supabase
        .from('team_members')
        .select('user_id, team_id, role, left_at, is_emergency, emergency_match_id, profile:profiles(discord_username, activision_id)')
        .in('team_id', [s.homeTeamId, s.awayTeamId]),
      supabase.from('checkins').select('team_id, player_ids').eq('match_id', id),
      supabase.from('report_submissions').select('id, maps, player_stats, screenshot_paths, submitted_at').eq('match_id', id).eq('team_id', myTeamId.value).maybeSingle(),
      // ?prefill=<id>: maps and screenshots saved by Discord's /report (step 21).
      prefill
        ? supabase.from('report_drafts').select('id, maps, screenshot_paths').eq('id', prefill).eq('match_id', id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const scheduled = match.value.scheduledAt
    roster.value = (members ?? [])
      .filter((r) => (!r.left_at || r.left_at > scheduled) && (!r.is_emergency || r.emergency_match_id === id))
      .map((r) => ({
        userId: r.user_id,
        teamId: r.team_id,
        name: playerName({ discordUsername: r.profile?.discord_username, activisionId: r.profile?.activision_id }),
        sub: r.role === 'sub' || r.is_emergency,
      }))
      .sort((a, b) => Number(a.sub) - Number(b.sub) || a.name.localeCompare(b.name))

    // Starting lineup: checked-in players, else the first four (starters first) of each roster.
    const lineup = (teamId: string) => {
      const checked = checkins?.find((c) => c.team_id === teamId)?.player_ids
      return checked?.length ? checked : roster.value.filter((r) => r.teamId === teamId).slice(0, 4).map((r) => r.userId)
    }

    submittedAt.value = mine?.submitted_at ?? null
    fromDiscord.value = Boolean(discordDraft)
    const draft = discordDraft ? null : readDraft(id, myTeamId.value)
    restoredDraft.value = Boolean(draft)
    if (discordDraft) {
      // Maps and screenshots from Discord; the line-up comes from check-in or the roster.
      const home = lineup(s.homeTeamId)
      const away = lineup(s.awayTeamId)
      maps.value = fromSubmission({ maps: discordDraft.maps, player_stats: [], screenshot_paths: discordDraft.screenshot_paths }, s).map((m) => ({
        ...m,
        players: emptyRows(s, home, away),
      }))
    } else if (draft) maps.value = draft
    else if (mine) maps.value = fromSubmission(mine, s)
    else {
      const home = lineup(s.homeTeamId)
      const away = lineup(s.awayTeamId)
      const first = emptyMap(s, home, away)
      maps.value = [first, emptyMap(s, home, away, first), emptyMap(s, home, away, first)]
    }
    await signPreviews(maps.value.flatMap((m) => m.screenshots))
    loading.value = false
  }

  function saveDraft(): boolean {
    const id = toValue(matchId)
    if (!id || !myTeamId.value) return false
    try {
      localStorage.setItem(draftKey(id, myTeamId.value), JSON.stringify({ maps: maps.value, savedAt: new Date().toISOString() }))
      return true
    } catch {
      return false
    }
  }

  function discardDraft() {
    const id = toValue(matchId)
    if (!id || !myTeamId.value) return
    try {
      localStorage.removeItem(draftKey(id, myTeamId.value))
    } catch {
      // Storage unavailable: nothing to remove.
    }
    restoredDraft.value = false
  }

  /** Compresses and uploads screenshots for map `index` (0-based); returns how many failed. */
  async function uploadScreenshots(index: number, files: File[]): Promise<Result<number>> {
    const id = toValue(matchId)
    const map = maps.value[index]
    if (!id || !myTeamId.value || !map) return { ok: false, message: 'Reload the page and try again.' }
    uploading.value = index
    let failed = 0
    const added: string[] = []
    for (const [i, file] of files.entries()) {
      try {
        const { blob, ext } = await compressImage(file)
        const path = screenshotPath(id, myTeamId.value, index + 1, `${Date.now().toString(36)}${i}`, ext)
        const { error } = await supabase.storage.from('screenshots').upload(path, blob, { contentType: blob.type, upsert: false })
        if (error) failed++
        else added.push(path)
      } catch {
        failed++
      }
    }
    map.screenshots = [...map.screenshots, ...added]
    await signPreviews(added)
    uploading.value = null
    return { ok: true, value: failed }
  }

  async function submit(): Promise<Result<MatchCardData['status']>> {
    const id = toValue(matchId)
    if (!id) return { ok: false, message: 'Match not found.' }
    submitting.value = true
    const { data, error } = await supabase.rpc('submit_report', {
      p_match_id: id,
      p_report: toPayload(maps.value) as unknown as Json,
      p_source: fromDiscord.value ? 'discord' : 'site',
    })
    submitting.value = false
    if (error) return { ok: false, message: dbErrorMessage(error, 'Could not submit the report. Please try again.') }
    discardDraft()
    submittedAt.value = new Date().toISOString()
    await reloadStatus()
    return { ok: true, value: data as MatchCardData['status'] }
  }

  watch([() => toValue(matchId), () => auth.isSignedIn], load, { immediate: true })

  return {
    match,
    myTeamId,
    roster,
    maps,
    sides,
    status,
    submittedAt,
    restoredDraft,
    fromDiscord,
    previews,
    loading,
    submitting,
    uploading,
    saveDraft,
    discardDraft,
    uploadScreenshots,
    submit,
    reload: load,
  }
}

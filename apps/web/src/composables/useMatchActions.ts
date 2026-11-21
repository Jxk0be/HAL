import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { supabase } from '@/lib/supabase'
import { dbErrorMessage } from '@/lib/errors'
import { compressImage } from '@/lib/image'
import { playerName } from '@/lib/players'
import type { DisputeCategory } from '@/lib/reschedule'
import { useAuthStore } from '@/stores/auth'
import type { Database, Json } from '@/types/database'

type Result<T = void> = { ok: true; value: T } | { ok: false; message: string }
type RescheduleStatus = Database['public']['Enums']['reschedule_status']

async function call<T>(p: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<Result<T>> {
  const { data, error } = await p
  if (error) return { ok: false, message: dbErrorMessage(error) }
  return { ok: true, value: data as T }
}

// ---- Reschedules ---------------------------------------------------------------------
export interface RescheduleRequest {
  id: string
  matchId: string
  teamId: string
  proposedAt: string
  status: RescheduleStatus
  createdAt: string
  respondedAt: string | null
}

const toRequest = (r: {
  id: string
  match_id: string
  requested_by_team_id: string
  proposed_at: string
  status: RescheduleStatus
  created_at: string
  responded_at: string | null
}): RescheduleRequest => ({
  id: r.id,
  matchId: r.match_id,
  teamId: r.requested_by_team_id,
  proposedAt: r.proposed_at,
  status: r.status,
  createdAt: r.created_at,
  respondedAt: r.responded_at,
})

const REQUEST_COLUMNS = 'id, match_id, requested_by_team_id, proposed_at, status, created_at, responded_at'

export const rescheduleActions = {
  request: (matchId: string, proposedAt: Date) =>
    call<string>(supabase.rpc('request_reschedule', { p_match_id: matchId, p_proposed_at: proposedAt.toISOString() })),
  respond: (requestId: string, accept: boolean) =>
    call<void>(supabase.rpc('respond_reschedule', { p_request_id: requestId, p_accept: accept })),
  cancel: (requestId: string) => call<void>(supabase.rpc('cancel_reschedule', { p_request_id: requestId })),
}

/** Reschedule requests for one match (public), newest first. */
export function useMatchReschedules(matchId: MaybeRefOrGetter<string | null | undefined>) {
  const requests = ref<RescheduleRequest[]>([])
  async function load() {
    const id = toValue(matchId)
    if (!id) return
    const { data } = await supabase.from('reschedule_requests').select(REQUEST_COLUMNS).eq('match_id', id).order('created_at', { ascending: false })
    requests.value = (data ?? []).map(toRequest)
  }
  watch(() => toValue(matchId), load, { immediate: true })
  return { requests, reload: load }
}

export interface TeamRequest extends RescheduleRequest {
  match: { id: string; week: number; defaultAt: string; scheduledAt: string; home: { id: string; tag: string; name: string }; away: { id: string; tag: string; name: string } }
}

/** Pending reschedule requests on a team's matches (sent and received), for the My Team panel. */
export function useTeamRequests(teamId: MaybeRefOrGetter<string | null | undefined>) {
  const requests = ref<TeamRequest[]>([])
  const loading = ref(true)
  async function load() {
    const id = toValue(teamId)
    if (!id) {
      requests.value = []
      loading.value = false
      return
    }
    const { data } = await supabase
      .from('reschedule_requests')
      .select(
        `${REQUEST_COLUMNS}, match:matches!inner(id, week, default_at, scheduled_at, home_team_id, away_team_id, home:teams!matches_home_team_id_fkey(id, tag, name), away:teams!matches_away_team_id_fkey(id, tag, name))`,
      )
      .eq('status', 'pending')
      .or(`home_team_id.eq.${id},away_team_id.eq.${id}`, { referencedTable: 'match' })
      .order('created_at')
    requests.value = (data ?? []).map((r) => ({
      ...toRequest(r),
      match: { id: r.match.id, week: r.match.week, defaultAt: r.match.default_at, scheduledAt: r.match.scheduled_at, home: r.match.home, away: r.match.away },
    }))
    loading.value = false
  }
  watch(() => toValue(teamId), load, { immediate: true })
  return { requests, loading, reload: load }
}

// ---- Disputes -----------------------------------------------------------------------
export interface DisputeThread {
  id: string
  teamId: string
  category: DisputeCategory
  reason: string
  status: 'open' | 'resolved'
  resolution: string | null
  createdAt: string
  evidence: { id: string; url: string | null; signedUrl: string | null; note: string | null }[]
  comments: { id: string; author: string; authorId: string; body: string; createdAt: string; staff: boolean }[]
}

/**
 * The latest dispute on a match with its evidence and comments. Evidence and comments are only
 * returned to the two teams and staff (RLS); everyone else sees the public reason and decision.
 */
export function useMatchDispute(matchId: MaybeRefOrGetter<string | null | undefined>) {
  const auth = useAuthStore()
  const dispute = ref<DisputeThread | null>(null)
  const busy = ref(false)

  async function load() {
    const id = toValue(matchId)
    if (!id || !auth.isSignedIn) {
      dispute.value = null
      return
    }
    const { data } = await supabase
      .from('disputes')
      .select('id, team_id, category, reason, status, resolution, created_at, evidence:dispute_evidence(id, url, storage_path, note), comments:dispute_comments(id, author_id, body, created_at)')
      .eq('match_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) {
      dispute.value = null
      return
    }
    const paths = data.evidence.map((e) => e.storage_path).filter((p): p is string => Boolean(p))
    const signed = paths.length ? (await supabase.storage.from('screenshots').createSignedUrls(paths, 3600)).data ?? [] : []
    const urlOf = new Map(paths.map((p, i) => [p, signed[i]?.signedUrl ?? null]))
    const authorIds = [...new Set(data.comments.map((c) => c.author_id))]
    const [{ data: authors }, { data: staff }] = authorIds.length
      ? await Promise.all([
          supabase.from('profiles').select('id, discord_username, activision_id').in('id', authorIds),
          supabase.from('staff_roles').select('user_id, role').in('user_id', authorIds),
        ])
      : [{ data: [] }, { data: [] }]
    const nameOf = new Map((authors ?? []).map((a) => [a.id, playerName({ discordUsername: a.discord_username, activisionId: a.activision_id })]))
    const staffIds = new Set((staff ?? []).filter((s) => s.role !== 'caster').map((s) => s.user_id))
    dispute.value = {
      id: data.id,
      teamId: data.team_id,
      category: data.category,
      reason: data.reason,
      status: data.status,
      resolution: data.resolution,
      createdAt: data.created_at,
      evidence: data.evidence.map((e) => ({ id: e.id, url: e.url, note: e.note, signedUrl: e.storage_path ? (urlOf.get(e.storage_path) ?? null) : null })),
      comments: data.comments
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => ({ id: c.id, authorId: c.author_id, author: nameOf.get(c.author_id) ?? 'Player', body: c.body, createdAt: c.created_at, staff: staffIds.has(c.author_id) })),
    }
  }

  /** Uploads evidence images to the team's dispute folder, then opens the dispute. */
  async function open(input: { matchId: string; teamId: string; category: DisputeCategory; description: string; files: File[]; links: { url: string; note: string }[] }): Promise<Result<string>> {
    busy.value = true
    try {
      const evidence: { path?: string; url?: string; note?: string }[] = []
      for (const [i, file] of input.files.entries()) {
        const { blob, ext } = await compressImage(file)
        const path = `disputes/${input.matchId}/${input.teamId}/${Date.now().toString(36)}${i}.${ext}`
        const { error } = await supabase.storage.from('screenshots').upload(path, blob, { contentType: blob.type })
        if (error) return { ok: false, message: 'An image didn’t upload. Try again.' }
        evidence.push({ path, note: file.name.slice(0, 80) })
      }
      for (const l of input.links) if (l.url.trim()) evidence.push({ url: l.url.trim(), note: l.note.trim() || undefined })
      const r = await call<string>(
        supabase.rpc('open_dispute', {
          p_match_id: input.matchId,
          p_category: input.category,
          p_description: input.description,
          p_evidence: evidence as unknown as Json,
        }),
      )
      if (r.ok) await load()
      return r
    } catch {
      return { ok: false, message: 'Couldn’t read one of the images. Try a PNG or JPEG.' }
    } finally {
      busy.value = false
    }
  }

  async function comment(body: string): Promise<Result> {
    if (!dispute.value) return { ok: false, message: 'No dispute.' }
    busy.value = true
    const r = await call<string>(supabase.rpc('add_dispute_comment', { p_dispute_id: dispute.value.id, p_body: body }))
    busy.value = false
    if (!r.ok) return r
    await load()
    return { ok: true, value: undefined }
  }

  watch([() => toValue(matchId), () => auth.isSignedIn], load, { immediate: true })
  return { dispute, busy, open, comment, reload: load }
}

// ---- Check-in -------------------------------------------------------------------------
export interface EligiblePlayer {
  userId: string
  name: string
  emergency: boolean
}

/** Eligible players for a team's check-in, and the check-in action (captains, T-15m to T+30m). */
export function useCheckin(matchId: MaybeRefOrGetter<string | null | undefined>, teamId: MaybeRefOrGetter<string | null | undefined>) {
  const players = ref<EligiblePlayer[]>([])
  const busy = ref(false)
  async function load() {
    const m = toValue(matchId)
    const t = toValue(teamId)
    if (!m || !t) {
      players.value = []
      return
    }
    const { data } = await supabase.rpc('eligible_checkin_players', { p_match_id: m, p_team_id: t })
    players.value = (data ?? []).map((p) => ({ userId: p.user_id, name: p.name, emergency: p.is_emergency }))
  }
  async function checkIn(playerIds: string[]): Promise<Result<{ players: string[] }>> {
    const m = toValue(matchId)
    if (!m) return { ok: false, message: 'Match not found.' }
    busy.value = true
    const r = await call<{ players: string[] }>(supabase.rpc('check_in', { p_match_id: m, p_player_ids: playerIds }))
    busy.value = false
    return r
  }
  watch([() => toValue(matchId), () => toValue(teamId)], load, { immediate: true })
  return { players, busy, checkIn, reload: load }
}

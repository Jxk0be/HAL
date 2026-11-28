import { ref, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { supabase } from '@/lib/supabase'
import { dbErrorMessage } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'

/**
 * Emergency subs (rule 4.3–4.4): the captain asks a free agent, the free agent accepts, then an
 * admin approves. Every rule is checked in Postgres (roster_requests_guard,
 * respond_emergency_sub); the bot DMs the player and tells the team channel and #admin-only.
 */
export type EsubState = 'waiting' | 'accepted' | 'approved' | 'declined' | 'denied'

export interface TeamEsubRequest {
  id: string
  player: string
  note: string | null
  state: EsubState
}

export interface EsubCandidate {
  id: string
  activisionId: string | null
  platform: string | null
  role: string | null
}

type Result = { ok: true } | { ok: false; message: string }

function stateOf(r: { status: string; player_confirmed_at: string | null; player_declined_at: string | null }): EsubState {
  if (r.player_declined_at) return 'declined'
  if (r.status === 'approved') return 'approved'
  if (r.status === 'denied') return 'denied'
  return r.player_confirmed_at ? 'accepted' : 'waiting'
}

export interface RosterPlayerStatus {
  userId: string
  name: string
  /** On the roster 24h before the match (rule 4.2). */
  eligible: boolean
  /** Marked out for this match by the captain. */
  out: boolean
  reason: string | null
}

/** Emergency subs per team per match (rule 4.3). */
export const MAX_EMERGENCY_SUBS = 2

/**
 * A team's emergency sub requests for one match, plus who's marked out (captains and co-captains).
 * A request needs fewer than 4 available players: eligible roster players minus those marked out.
 */
export function useMatchEmergencySubs(
  match: MaybeRefOrGetter<{ id: string; scheduledAt: string }>,
  teamId: MaybeRefOrGetter<string | null>,
) {
  const requests = ref<TeamEsubRequest[]>([])
  const roster = ref<RosterPlayerStatus[]>([])
  const busy = ref(false)

  async function load() {
    const t = toValue(teamId)
    const m = toValue(match)
    if (!t) {
      requests.value = []
      roster.value = []
      return
    }
    const [{ data: reqs }, { data: members }, { data: absences }] = await Promise.all([
      supabase
        .from('roster_requests')
        .select('id, note, status, player_confirmed_at, player_declined_at, player:profiles!roster_requests_user_id_fkey(activision_id, discord_username)')
        .eq('type', 'emergency_sub')
        .eq('match_id', m.id)
        .eq('team_id', t)
        .order('created_at', { ascending: false }),
      supabase
        .from('team_members')
        .select('user_id, joined_at, profile:profiles(activision_id, discord_username)')
        .eq('team_id', t)
        .is('left_at', null)
        .eq('is_emergency', false),
      supabase.from('match_absences').select('user_id, reason').eq('match_id', m.id).eq('team_id', t),
    ])
    requests.value = (reqs ?? []).map((r) => ({
      id: r.id,
      player: r.player?.activision_id ?? r.player?.discord_username ?? 'Free agent',
      note: r.note,
      state: stateOf(r),
    }))
    const cutoff = new Date(m.scheduledAt).getTime() - 24 * 3600_000
    const out = new Map((absences ?? []).map((a) => [a.user_id, a.reason]))
    roster.value = (members ?? []).map((tm) => ({
      userId: tm.user_id,
      name: tm.profile?.activision_id ?? tm.profile?.discord_username ?? 'Player',
      eligible: new Date(tm.joined_at).getTime() <= cutoff,
      out: out.has(tm.user_id),
      reason: out.get(tm.user_id) ?? null,
    }))
  }

  /** Mark players out (optional) and ask a free agent, in one step. */
  async function request(userId: string, opts: { outIds: string[]; reason: string; note: string }): Promise<Result> {
    const t = toValue(teamId)
    if (!t) return { ok: false, message: 'Only captains can request an emergency sub.' }
    busy.value = true
    const { error } = await supabase.rpc('request_emergency_sub', {
      p_match_id: toValue(match).id,
      p_team_id: t,
      p_user_id: userId,
      p_out_ids: opts.outIds,
      p_reason: opts.reason.trim() || undefined,
      p_note: opts.note.trim() || undefined,
    })
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error) }
    await load()
    return { ok: true }
  }

  /** Put a player back (only while no emergency sub is approved for this match). */
  async function clearOut(userId: string): Promise<Result> {
    busy.value = true
    const { error } = await supabase.from('match_absences').delete().eq('match_id', toValue(match).id).eq('user_id', userId)
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error) }
    await load()
    return { ok: true }
  }

  /** Withdraw a request the player hasn't answered or an admin hasn't reviewed yet. */
  async function cancel(id: string): Promise<Result> {
    busy.value = true
    const { error } = await supabase.from('roster_requests').delete().eq('id', id).eq('status', 'pending')
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error) }
    await load()
    return { ok: true }
  }

  /**
   * Players for the picker: listed free agents when the box is empty, otherwise anyone not on a team
   * matching the search (invitable_players). The database re-checks eligibility on request.
   */
  async function search(q: string): Promise<EsubCandidate[]> {
    if (q.trim().length < 2) {
      const { data } = await supabase.rpc('free_agent_board', { p_limit: 8 })
      return (data ?? []).map((f) => ({ id: f.id, activisionId: f.activision_id, platform: f.platform, role: f.preferred_role }))
    }
    const { data } = await supabase.rpc('invitable_players', { p_search: q, p_limit: 8 })
    return (data ?? []).map((f) => ({ id: f.id, activisionId: f.activision_id, platform: f.platform, role: null }))
  }

  /** True once the first load has finished (cards stay hidden until then instead of flashing). */
  const loaded = ref(false)
  watch([() => toValue(match).id, () => toValue(teamId)], async () => {
    await load()
    loaded.value = true
  }, { immediate: true })
  return { requests, roster, busy, loaded, request, clearOut, cancel, search, reload: load }
}

export interface MyEsubRequest {
  id: string
  team: { id: string; name: string; tag: string }
  match: { id: string; week: number; scheduledAt: string; home: string; away: string }
  note: string | null
  accepted: boolean
}

/** The signed-in player's open emergency sub requests, with accept / decline. */
export function useMyEmergencySubRequests() {
  const auth = useAuthStore()
  const requests = ref<MyEsubRequest[]>([])
  const busyId = ref<string | null>(null)
  const loading = ref(true)

  async function load() {
    const uid = auth.user?.id
    if (!uid) {
      requests.value = []
      loading.value = false
      return
    }
    const { data } = await supabase
      .from('roster_requests')
      .select(
        'id, note, player_confirmed_at, team:teams(id, name, tag), match:matches(id, week, scheduled_at, status, home:teams!matches_home_team_id_fkey(tag), away:teams!matches_away_team_id_fkey(tag))',
      )
      .eq('type', 'emergency_sub')
      .eq('user_id', uid)
      .eq('status', 'pending')
      .is('player_declined_at', null)
      .order('created_at', { ascending: false })
    requests.value = (data ?? [])
      .filter((r) => r.team && r.match && ['scheduled', 'checkin_open', 'live'].includes(r.match.status))
      .map((r) => ({
        id: r.id,
        team: { id: r.team!.id, name: r.team!.name, tag: r.team!.tag },
        match: { id: r.match!.id, week: r.match!.week, scheduledAt: r.match!.scheduled_at, home: r.match!.home.tag, away: r.match!.away.tag },
        note: r.note,
        accepted: Boolean(r.player_confirmed_at),
      }))
    loading.value = false
  }

  async function respond(id: string, accept: boolean): Promise<Result> {
    busyId.value = id
    const { error } = await supabase.rpc('respond_emergency_sub', { p_request_id: id, p_accept: accept })
    busyId.value = null
    if (error) return { ok: false, message: dbErrorMessage(error) }
    await load()
    return { ok: true }
  }

  watch(() => auth.user?.id, load, { immediate: true })
  return { requests, busyId, loading, respond, reload: load }
}

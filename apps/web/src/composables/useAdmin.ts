import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { supabase } from '@/lib/supabase'
import { dbErrorMessage } from '@/lib/errors'
import { playerName } from '@/lib/players'
import { useAuthStore } from '@/stores/auth'
import type { Database, Json } from '@/types/database'

export type Result<T = void> = { ok: true; value: T } | { ok: false; message: string }

async function rpcResult<T>(p: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<Result<T>> {
  const { data, error } = await p
  if (error) return { ok: false, message: dbErrorMessage(error) }
  return { ok: true, value: data as T }
}

/**
 * Recusal in the UI mirrors can_staff_match(): staff on either team can't act. The database is the
 * real check; this only greys things out.
 */
export function useRecusal() {
  const auth = useAuthStore()
  const myTeamId = computed(() => auth.team?.id ?? null)
  return {
    isRecused: (...teamIds: (string | null | undefined)[]) => Boolean(myTeamId.value && teamIds.includes(myTeamId.value)),
  }
}

// ---- Overview --------------------------------------------------------------------
export interface AdminOverview {
  open_mismatch_matches: number
  open_mismatch_fields: number
  open_disputes: number
  pending_roster_requests: number
  pending_teams: number
  unreported_past_24h: number
  matches_this_week: number
}

export function useAdminOverview() {
  const overview = ref<AdminOverview | null>(null)
  const loading = ref(true)
  async function load() {
    const { data } = await supabase.rpc('admin_overview')
    overview.value = (data as unknown as AdminOverview) ?? null
    loading.value = false
  }
  void load()
  return { overview, loading, reload: load }
}

// ---- Mismatches ------------------------------------------------------------------
export interface QueueTeam {
  id: string
  name: string
  tag: string
}
export interface QueueItem {
  match_id: string
  week: number
  status: Database['public']['Enums']['match_status']
  scheduled_at: string
  home: QueueTeam
  away: QueueTeam
  map_fields: number
  player_fields: number
  oldest: string
  recused: boolean
}

export function useMismatchQueue() {
  const items = ref<QueueItem[]>([])
  const loading = ref(true)
  async function load() {
    const { data } = await supabase.rpc('admin_mismatch_queue')
    items.value = (Array.isArray(data) ? data : []) as unknown as QueueItem[]
    loading.value = false
  }
  void load()
  return { items, loading, reload: load }
}

export interface MismatchRow {
  id: string
  matchMapId: string
  mapNumber: number
  kind: 'map_score' | 'player_stat'
  field: string
  userId: string | null
  player: string | null
  homeValue: string | null
  awayValue: string | null
  resolvedValue: string | null
  resolvedAt: string | null
}

export interface ReportSide {
  teamId: string
  submittedAt: string
  maps: { number: number; mode_id: string; map_id: string; home_score: number; away_score: number }[]
  players: Record<number, { user_id: string; team_id: string; kills: number; deaths: number; score: number }[]>
  screenshots: { path: string; url: string; mapNumber: number }[]
}

/** Everything needed to settle one match's mismatches (staff RLS; recused admins get nothing). */
export function useMismatchDetail(matchId: MaybeRefOrGetter<string | null | undefined>) {
  const match = ref<{
    id: string
    week: number
    status: QueueItem['status']
    scheduledAt: string
    home: QueueTeam
    away: QueueTeam
  } | null>(null)
  const rows = ref<MismatchRow[]>([])
  const reports = ref<{ home: ReportSide | null; away: ReportSide | null }>({ home: null, away: null })
  const names = ref<Record<string, string>>({})
  const modes = ref<{ id: string; name: string }[]>([])
  const maps = ref<{ id: string; name: string }[]>([])
  const loading = ref(true)
  const busy = ref(false)

  async function load() {
    const id = toValue(matchId)
    if (!id) return
    loading.value = true
    const [{ data: m }, { data: mm }, { data: subs }, { data: gm }, { data: mp }] = await Promise.all([
      supabase
        .from('matches')
        .select('id, week, status, scheduled_at, home:teams!matches_home_team_id_fkey(id, name, tag), away:teams!matches_away_team_id_fkey(id, name, tag)')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('match_maps')
        .select('id, map_number, mismatches:stat_mismatches(id, kind, field, user_id, home_value, away_value, resolved_value, resolved_at, profile:profiles!stat_mismatches_user_id_fkey(discord_username, activision_id))')
        .eq('match_id', id)
        .order('map_number'),
      supabase.from('report_submissions').select('team_id, submitted_at, maps, player_stats, screenshot_paths').eq('match_id', id),
      supabase.from('game_modes').select('id, name').order('sort_order'),
      supabase.from('maps').select('id, name').order('name'),
    ])
    modes.value = gm ?? []
    maps.value = mp ?? []
    if (!m) {
      match.value = null
      loading.value = false
      return
    }
    match.value = { id: m.id, week: m.week, status: m.status, scheduledAt: m.scheduled_at, home: m.home, away: m.away }

    const n: Record<string, string> = {}
    rows.value = (mm ?? []).flatMap((map) =>
      map.mismatches.map((s) => {
        const player = s.profile ? playerName({ discordUsername: s.profile.discord_username, activisionId: s.profile.activision_id }) : null
        if (s.user_id && player) n[s.user_id] = player
        return {
          id: s.id,
          matchMapId: map.id,
          mapNumber: map.map_number,
          kind: s.kind,
          field: s.field,
          userId: s.user_id,
          player,
          homeValue: s.home_value,
          awayValue: s.away_value,
          resolvedValue: s.resolved_value,
          resolvedAt: s.resolved_at,
        }
      }),
    )

    // Both teams' full reports, side by side, with signed screenshot URLs.
    const allPaths = (subs ?? []).flatMap((s) => s.screenshot_paths)
    const signed = allPaths.length
      ? (await supabase.storage.from('screenshots').createSignedUrls(allPaths, 3600)).data ?? []
      : []
    const urlOf = new Map(allPaths.map((p, i) => [p, signed[i]?.signedUrl ?? '']))
    const side = (teamId: string): ReportSide | null => {
      const s = (subs ?? []).find((x) => x.team_id === teamId)
      if (!s) return null
      const stats = (Array.isArray(s.player_stats) ? s.player_stats : []) as unknown as { number: number; players: ReportSide['players'][number] }[]
      return {
        teamId,
        submittedAt: s.submitted_at,
        maps: (Array.isArray(s.maps) ? s.maps : []) as unknown as ReportSide['maps'],
        players: Object.fromEntries(stats.map((x) => [x.number, x.players])),
        screenshots: s.screenshot_paths
          .map((p) => ({ path: p, url: urlOf.get(p) ?? '', mapNumber: Number(/\/map(\d+)-/.exec(p)?.[1] ?? 0) }))
          .filter((x) => x.url),
      }
    }
    reports.value = { home: side(m.home.id), away: side(m.away.id) }

    // Names for every player in either report.
    const ids = new Set<string>()
    for (const r of [reports.value.home, reports.value.away]) {
      for (const lines of Object.values(r?.players ?? {})) for (const l of lines) ids.add(l.user_id)
    }
    const missing = [...ids].filter((x) => !n[x])
    if (missing.length) {
      const { data: profs } = await supabase.from('profiles').select('id, discord_username, activision_id').in('id', missing)
      for (const p of profs ?? []) n[p.id] = playerName({ discordUsername: p.discord_username, activisionId: p.activision_id })
    }
    names.value = n
    loading.value = false
  }

  async function resolve(id: string, choice: 'home' | 'away' | 'custom', value?: string) {
    busy.value = true
    const r = await rpcResult<{ remaining: number; status: string; series: { home: number; away: number; valid: boolean } }>(
      supabase.rpc('resolve_mismatch', { p_mismatch_id: id, p_choice: choice, p_value: value }),
    )
    busy.value = false
    if (r.ok) await load()
    return r
  }

  watch(() => toValue(matchId), load, { immediate: true })
  return { match, rows, reports, names, modes, maps, loading, busy, resolve, reload: load }
}

// ---- Results ---------------------------------------------------------------------
export interface ResultMap {
  mode_id: string
  map_id: string
  home_score: number | null
  away_score: number | null
}

export const adminResults = {
  setResult: (matchId: string, maps: ResultMap[]) =>
    rpcResult<void>(supabase.rpc('admin_set_result', { p_match_id: matchId, p_maps: maps as unknown as Json })),
  clearResult: (matchId: string) => rpcResult<void>(supabase.rpc('admin_clear_result', { p_match_id: matchId })),
  forfeit: (matchId: string, teamId: string) =>
    rpcResult<void>(supabase.rpc('admin_forfeit', { p_match_id: matchId, p_forfeit_team_id: teamId })),
  ban: (userId: string, until: string | null, reason: string) =>
    rpcResult<void>(supabase.rpc('ban_player', { p_user_id: userId, p_until: until as string, p_reason: reason })),
}

// ---- Disputes --------------------------------------------------------------------
export interface DisputeRow {
  id: string
  matchId: string
  teamId: string
  category: string
  reason: string
  status: 'open' | 'resolved'
  resolution: string | null
  resolvedAt: string | null
  createdAt: string
  openedBy: string
  match: { week: number; scheduledAt: string; status: QueueItem['status']; home: QueueTeam; away: QueueTeam }
  evidence: { id: string; url: string | null; path: string | null; note: string | null; signedUrl: string | null }[]
}

export function useDisputes() {
  const auth = useAuthStore()
  const rows = ref<DisputeRow[]>([])
  const loading = ref(true)
  const busy = ref(false)

  async function load() {
    const { data } = await supabase
      .from('disputes')
      .select(
        'id, match_id, team_id, category, reason, status, resolution, resolved_at, created_at, opener:profiles!disputes_opened_by_fkey(discord_username, activision_id), match:matches(week, scheduled_at, status, home:teams!matches_home_team_id_fkey(id, name, tag), away:teams!matches_away_team_id_fkey(id, name, tag)), evidence:dispute_evidence(id, url, storage_path, note)',
      )
      .order('status')
      .order('created_at', { ascending: false })
    const list = data ?? []
    const paths = list.flatMap((d) => d.evidence.map((e) => e.storage_path).filter((p): p is string => Boolean(p)))
    const signed = paths.length ? (await supabase.storage.from('screenshots').createSignedUrls(paths, 3600)).data ?? [] : []
    const urlOf = new Map(paths.map((p, i) => [p, signed[i]?.signedUrl ?? null]))
    rows.value = list
      .filter((d) => d.match)
      .map((d) => ({
        id: d.id,
        matchId: d.match_id,
        teamId: d.team_id,
        category: d.category,
        reason: d.reason,
        status: d.status,
        resolution: d.resolution,
        resolvedAt: d.resolved_at,
        createdAt: d.created_at,
        openedBy: playerName({ discordUsername: d.opener?.discord_username, activisionId: d.opener?.activision_id }),
        match: { week: d.match!.week, scheduledAt: d.match!.scheduled_at, status: d.match!.status, home: d.match!.home, away: d.match!.away },
        evidence: d.evidence.map((e) => ({ id: e.id, url: e.url, path: e.storage_path, note: e.note, signedUrl: e.storage_path ? (urlOf.get(e.storage_path) ?? null) : null })),
      }))
    loading.value = false
  }

  async function run(p: PromiseLike<{ error: { code?: string; message: string } | null }>): Promise<Result> {
    busy.value = true
    const { error } = await p
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error) }
    await load()
    return { ok: true, value: undefined }
  }

  void load()
  return {
    rows,
    loading,
    busy,
    reload: load,
    resolve: (id: string, resolution: string) =>
      run(supabase.from('disputes').update({ status: 'resolved', resolution: resolution.trim() }).eq('id', id)),
    reopen: (id: string) => run(supabase.from('disputes').update({ status: 'open' }).eq('id', id)),
    penalty: (p: { team_id: string | null; user_id: string | null; match_id: string | null; type: Database['public']['Enums']['penalty_type']; note: string }) =>
      // penalties_guard sets issued_by to the caller anyway.
      run(supabase.from('penalties').insert({ ...p, issued_by: auth.profile?.id ?? '' })),
  }
}

// ---- Roster requests -------------------------------------------------------------
export interface RosterRequestRow {
  id: string
  type: Database['public']['Enums']['roster_request_type']
  note: string | null
  createdAt: string
  team: { id: string; name: string; tag: string; changesUsed: number; maxChanges: number; lockAt: string | null }
  player: string
  userId: string
  /** Emergency subs: the free agent has agreed (admins can approve only then). Always true for other types. */
  playerAccepted: boolean
  /** Emergency subs: players the captain marked out for that match, with the reason. */
  out: { name: string; reason: string | null }[]
  match: { id: string; week: number; scheduledAt: string; home: QueueTeam; away: QueueTeam } | null
}

export function useRosterRequests() {
  const rows = ref<RosterRequestRow[]>([])
  const loading = ref(true)
  const busy = ref(false)

  async function load() {
    const { data } = await supabase
      .from('roster_requests')
      .select(
        'id, type, note, created_at, user_id, player_confirmed_at, team:teams(id, name, tag, roster_changes_used, season:seasons(max_roster_changes, roster_lock_at)), player:profiles!roster_requests_user_id_fkey(discord_username, activision_id), match:matches(id, week, scheduled_at, home:teams!matches_home_team_id_fkey(id, name, tag), away:teams!matches_away_team_id_fkey(id, name, tag))',
      )
      .eq('status', 'pending')
      .order('created_at')
    const matchIds = [...new Set((data ?? []).map((r) => r.match?.id).filter((x): x is string => Boolean(x)))]
    const { data: absences } = matchIds.length
      ? await supabase
          .from('match_absences')
          .select('match_id, team_id, reason, player:profiles!match_absences_user_id_fkey(activision_id, discord_username)')
          .in('match_id', matchIds)
      : { data: [] }
    const outFor = (matchId: string | undefined, teamId: string) =>
      (absences ?? [])
        .filter((a) => a.match_id === matchId && a.team_id === teamId)
        .map((a) => ({ name: a.player?.activision_id ?? a.player?.discord_username ?? 'Player', reason: a.reason }))
    rows.value = (data ?? [])
      .filter((r) => r.team)
      .map((r) => ({
        id: r.id,
        type: r.type,
        note: r.note,
        createdAt: r.created_at,
        userId: r.user_id,
        playerAccepted: r.type !== 'emergency_sub' || Boolean(r.player_confirmed_at),
        out: r.type === 'emergency_sub' ? outFor(r.match?.id, r.team!.id) : [],
        team: {
          id: r.team!.id,
          name: r.team!.name,
          tag: r.team!.tag,
          changesUsed: r.team!.roster_changes_used,
          maxChanges: r.team!.season?.max_roster_changes ?? 0,
          lockAt: r.team!.season?.roster_lock_at ?? null,
        },
        player: playerName({ discordUsername: r.player?.discord_username, activisionId: r.player?.activision_id }),
        match: r.match ? { id: r.match.id, week: r.match.week, scheduledAt: r.match.scheduled_at, home: r.match.home, away: r.match.away } : null,
      }))
    loading.value = false
  }

  async function review(id: string, approve: boolean, note?: string): Promise<Result> {
    busy.value = true
    const { error } = await supabase
      .from('roster_requests')
      .update({ status: approve ? 'approved' : 'denied', ...(note ? { note } : {}) })
      .eq('id', id)
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error) }
    await load()
    return { ok: true, value: undefined }
  }

  void load()
  return { rows, loading, busy, review, reload: load }
}

// ---- Staff roles -----------------------------------------------------------------
export type StaffRole = Database['public']['Enums']['staff_role']
export interface UserWithRoles {
  id: string
  name: string
  discordUsername: string | null
  activisionId: string | null
  avatarUrl: string | null
  /** False for staff-only accounts. */
  isPlayer: boolean
  roles: StaffRole[]
}

export function useStaffRoles() {
  const staff = ref<UserWithRoles[]>([])
  const results = ref<UserWithRoles[]>([])
  const loading = ref(true)
  const busy = ref(false)

  type RoleProfile = { id: string; discord_username: string | null; activision_id: string | null; avatar_url: string | null; is_player: boolean }
  const COLS = 'id, discord_username, activision_id, avatar_url, is_player'

  async function withRoles(profiles: RoleProfile[]) {
    const ids = profiles.map((p) => p.id)
    const { data: roles } = ids.length ? await supabase.from('staff_roles').select('user_id, role').in('user_id', ids) : { data: [] }
    return profiles.map((p) => ({
      id: p.id,
      name: playerName({ discordUsername: p.discord_username, activisionId: p.activision_id }),
      discordUsername: p.discord_username,
      activisionId: p.activision_id,
      avatarUrl: p.avatar_url,
      isPlayer: p.is_player,
      roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
    }))
  }

  async function loadStaff() {
    const { data: roles } = await supabase.from('staff_roles').select('user_id')
    const ids = [...new Set((roles ?? []).map((r) => r.user_id))]
    const { data: profs } = ids.length
      ? await supabase.from('profiles').select(COLS).in('id', ids)
      : { data: [] }
    staff.value = (await withRoles(profs ?? [])).sort((a, b) => a.name.localeCompare(b.name))
    loading.value = false
  }

  async function search(q: string) {
    const term = q.trim().replace(/[%_,()]/g, '')
    if (term.length < 2) {
      results.value = []
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select(COLS)
      .or(`discord_username.ilike.%${term}%,activision_id.ilike.%${term}%`)
      .limit(10)
    results.value = await withRoles(data ?? [])
  }

  async function setRole(userId: string, role: StaffRole, on: boolean): Promise<Result> {
    busy.value = true
    const { error } = on
      ? await supabase.from('staff_roles').insert({ user_id: userId, role })
      : await supabase.from('staff_roles').delete().eq('user_id', userId).eq('role', role)
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error, undefined, 'They already have that role.') }
    await loadStaff()
    await refreshResults()
    return { ok: true, value: undefined }
  }

  async function refreshResults() {
    results.value = await withRoles(
      results.value.map((r) => ({ id: r.id, discord_username: r.discordUsername, activision_id: r.activisionId, avatar_url: r.avatarUrl, is_player: r.isPlayer })),
    )
  }

  /** Owner only: staff-only accounts don't play (off every player list, can't be on a team). */
  async function setPlaying(userId: string, isPlayer: boolean): Promise<Result> {
    busy.value = true
    const { error } = await supabase.from('profiles').update({ is_player: isPlayer }).eq('id', userId)
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error) }
    await loadStaff()
    await refreshResults()
    return { ok: true, value: undefined }
  }

  void loadStaff()
  return { staff, results, loading, busy, search, setRole, setPlaying }
}

// ---- Content: teams, free agent posts, players --------------------------------------
export interface ContentTeam {
  id: string
  name: string
  tag: string
  status: Database['public']['Enums']['team_status']
  divisionId: string | null
  rosterSize: number
  forfeits: number
}

async function runWrite(busy: { value: boolean }, p: PromiseLike<{ data?: unknown; error: { code?: string; message: string } | null }>, after: () => Promise<void>, recusedMessage?: string): Promise<Result> {
  busy.value = true
  const { data, error } = await p
  busy.value = false
  if (error) return { ok: false, message: dbErrorMessage(error) }
  // RLS hides rows a recused admin can't change, so "no rows updated" means recused.
  if (recusedMessage && Array.isArray(data) && data.length === 0) return { ok: false, message: recusedMessage }
  await after()
  return { ok: true, value: undefined }
}

export function useContentTeams(seasonId: MaybeRefOrGetter<string | null | undefined>) {
  const teams = ref<ContentTeam[]>([])
  const divisions = ref<{ id: string; name: string }[]>([])
  const loading = ref(true)
  const busy = ref(false)
  const RECUSED = 'Recused: this is your team, so another admin has to change it.'

  async function load() {
    const id = toValue(seasonId)
    if (!id) {
      loading.value = false
      return
    }
    const [{ data }, { data: divs }] = await Promise.all([
      supabase
        .from('teams')
        .select('id, name, tag, status, division_id, forfeit_count, members:team_members(left_at, is_emergency)')
        .eq('season_id', id)
        .order('name'),
      supabase.from('divisions').select('id, name').eq('season_id', id).order('tier'),
    ])
    divisions.value = divs ?? []
    teams.value = (data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      tag: t.tag,
      status: t.status,
      divisionId: t.division_id,
      rosterSize: t.members.filter((m) => !m.left_at && !m.is_emergency).length,
      forfeits: t.forfeit_count,
    }))
    loading.value = false
  }

  const update = (teamId: string, patch: { name?: string; tag?: string; status?: ContentTeam['status']; division_id?: string | null }) =>
    runWrite(busy, supabase.from('teams').update(patch).eq('id', teamId).select('id'), load, RECUSED)

  /**
   * Deletes a team and makes every player on it a free agent. Teams that already have matches
   * are marked removed instead (so opponents' results stay), with the roster emptied.
   */
  async function deleteTeam(teamId: string): Promise<Result<{ deleted: boolean; released: number }>> {
    busy.value = true
    const { data, error } = await supabase.rpc('admin_delete_team', { p_team_id: teamId })
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error) }
    await load()
    const r = (data ?? {}) as { deleted?: boolean; released?: number }
    return { ok: true, value: { deleted: r.deleted ?? true, released: r.released ?? 0 } }
  }

  watch(() => toValue(seasonId), load, { immediate: true })
  return { teams, divisions, loading, busy, update, deleteTeam, reload: load }
}

export interface ContentPost {
  id: string
  userId: string
  player: string
  platform: string
  role: string | null
  note: string | null
  active: boolean
  createdAt: string
}

export function useContentPosts() {
  const posts = ref<ContentPost[]>([])
  const loading = ref(true)
  const busy = ref(false)
  async function load() {
    const { data } = await supabase
      .from('free_agent_posts')
      .select('id, user_id, platform, preferred_role, note, active, created_at, profile:profiles(discord_username, activision_id)')
      .order('created_at', { ascending: false })
      .limit(200)
    posts.value = (data ?? []).map((p) => ({
      id: p.id,
      userId: p.user_id,
      player: playerName({ discordUsername: p.profile?.discord_username, activisionId: p.profile?.activision_id }),
      platform: p.platform,
      role: p.preferred_role,
      note: p.note,
      active: p.active,
      createdAt: p.created_at,
    }))
    loading.value = false
  }
  void load()
  return {
    posts,
    loading,
    busy,
    setActive: (id: string, active: boolean) => runWrite(busy, supabase.from('free_agent_posts').update({ active }).eq('id', id), load),
    remove: (id: string) => runWrite(busy, supabase.from('free_agent_posts').delete().eq('id', id), load),
  }
}

export interface ContentPlayer {
  id: string
  name: string
  activisionId: string | null
  bannedUntil: string | null
  team: { id: string; tag: string } | null
  /** Admin "incomplete data" flag on this season's leaderboard (note may be empty). */
  statsFlag: { note: string | null } | null
}

export function useContentPlayers() {
  const players = ref<ContentPlayer[]>([])
  const loading = ref(false)
  const busy = ref(false)
  let lastQuery = ''
  const seasonId = ref<string | null>(null)
  const flags = ref(new Map<string, string | null>())

  async function loadFlags() {
    if (!seasonId.value) {
      const { data } = await supabase.from('seasons').select('id').in('status', ['signups', 'regular', 'playoffs']).maybeSingle()
      seasonId.value = data?.id ?? null
    }
    if (!seasonId.value) return
    const { data } = await supabase.from('player_stat_flags').select('user_id, note').eq('season_id', seasonId.value)
    flags.value = new Map((data ?? []).map((f) => [f.user_id, f.note]))
  }

  async function search(q: string) {
    lastQuery = q
    const term = q.trim().replace(/[%_,()]/g, '')
    loading.value = true
    await loadFlags()
    let query = supabase
      .from('profiles')
      .select('id, discord_username, activision_id, banned_until, members:team_members(left_at, is_emergency, team:teams(id, tag))')
      .order('discord_username')
      .limit(30)
    const flagged = [...flags.value.keys()]
    query = term.length >= 2
      ? query.or(`discord_username.ilike.%${term}%,activision_id.ilike.%${term}%`)
      : flagged.length
        ? query.or(`banned_until.not.is.null,id.in.(${flagged.join(',')})`)
        : query.not('banned_until', 'is', null)
    const { data } = await query
    players.value = (data ?? []).map((p) => {
      const m = p.members.find((x) => !x.left_at && !x.is_emergency)
      return {
        id: p.id,
        name: playerName({ discordUsername: p.discord_username, activisionId: p.activision_id }),
        activisionId: p.activision_id,
        bannedUntil: p.banned_until,
        team: m?.team ? { id: m.team.id, tag: m.team.tag } : null,
        statsFlag: flags.value.has(p.id) ? { note: flags.value.get(p.id) ?? null } : null,
      }
    })
    loading.value = false
  }

  async function ban(userId: string, until: string | null, reason: string): Promise<Result> {
    busy.value = true
    const r = await adminResults.ban(userId, until, reason)
    busy.value = false
    if (r.ok) await search(lastQuery)
    return r
  }

  /** Mark a player's stats as incomplete on this season's leaderboard (or update the note). */
  async function flagStats(userId: string, note: string): Promise<Result> {
    if (!seasonId.value) return { ok: false, message: 'There is no active season.' }
    busy.value = true
    const { error } = await supabase
      .from('player_stat_flags')
      .upsert({ season_id: seasonId.value, user_id: userId, note: note.trim() || null }, { onConflict: 'season_id,user_id' })
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error, "Couldn't save. You can't flag yourself or a teammate.") }
    await search(lastQuery)
    return { ok: true, value: undefined }
  }

  async function clearStatsFlag(userId: string): Promise<Result> {
    if (!seasonId.value) return { ok: false, message: 'There is no active season.' }
    busy.value = true
    const { data, error } = await supabase
      .from('player_stat_flags')
      .delete()
      .eq('season_id', seasonId.value)
      .eq('user_id', userId)
      .select('id')
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error) }
    if (!data?.length) return { ok: false, message: "Recused: you can't change your own or a teammate's stats flag." }
    await search(lastQuery)
    return { ok: true, value: undefined }
  }

  void search('')
  return { players, loading, busy, search, ban, flagStats, clearStatsFlag }
}

/** Name and tag of every team in a season (for pickers and labels). */
export function useSeasonTeamNames(seasonId: MaybeRefOrGetter<string | null | undefined>) {
  const teams = ref<{ id: string; name: string; tag: string }[]>([])
  watch(
    () => toValue(seasonId),
    async (id) => {
      if (!id) return
      const { data } = await supabase.from('teams').select('id, name, tag').eq('season_id', id).order('name')
      teams.value = data ?? []
    },
    { immediate: true },
  )
  return { teams }
}

/** A match's current maps, for editing the result. */
export async function loadResultMaps(matchId: string): Promise<ResultMap[]> {
  const { data } = await supabase
    .from('match_maps')
    .select('map_number, mode_id, map_id, home_score, away_score')
    .eq('match_id', matchId)
    .order('map_number')
  return (data ?? []).map((m) => ({ mode_id: m.mode_id, map_id: m.map_id, home_score: m.home_score, away_score: m.away_score }))
}

// ---- Health ----------------------------------------------------------------------
export interface AdminHealth {
  client_errors_24h: number
  bot_errors_24h: number
  outbox_waiting: number
  outbox_failing: number
  outbox_oldest: string | null
  client_errors: { id: number; at: string; message: string; url: string | null; stack: string | null; release: string | null }[]
  bot_errors: { id: number; at: string; action: string; error: string }[]
  cron: { job: string; schedule: string; active: boolean; last_status: string | null; last_run: string | null }[]
}

/** Site errors, bot errors, the Discord outbox backlog and scheduled jobs (admins). */
export function useAdminHealth() {
  const health = ref<AdminHealth | null>(null)
  const loading = ref(true)
  async function load() {
    loading.value = true
    const { data } = await supabase.rpc('admin_health')
    health.value = (data as unknown as AdminHealth) ?? null
    loading.value = false
  }
  void load()
  return { health, loading, reload: load }
}

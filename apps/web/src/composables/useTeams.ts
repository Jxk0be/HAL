import { ref, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { supabase } from '@/lib/supabase'
import { sortRoster, type RosterPlayer, type SeasonRules, type TeamStatus } from '@/lib/teams'
import { playerName } from '@/lib/players'
import { useAuthStore } from '@/stores/auth'

export interface TeamSummary {
  id: string
  name: string
  tag: string
  logoUrl: string | null
  bannerUrl: string | null
  status: TeamStatus
  division: string | null
  divisionId: string | null
  rosterSize: number
  /** Starters' avatars for the card (Activision IDs only; works logged out). */
  starters: { avatarUrl: string | null; name: string }[]
}

export interface TeamDetail extends TeamSummary {
  seasonId: string
  seasonName: string
  captainId: string
  coCaptainId: string | null
  rosterChangesUsed: number
  forfeitCount: number
  reviewNote: string | null
  description: string | null
  rules: SeasonRules
  roster: RosterPlayer[]
}

// Discord usernames are only readable when signed in, so there are two selects.
const TEAM_DETAIL_SELECT = `
  id, name, tag, logo_url, banner_url, description, status, season_id, division_id, forfeit_count, captain_id, co_captain_id, roster_changes_used, review_note,
  division:divisions(name),
  season:seasons(name, status, max_roster, max_starters, max_subs, max_roster_changes, roster_lock_at),
  members:team_members(id, user_id, role, joined_at, left_at, is_emergency,
    profile:profiles(discord_username, avatar_url, activision_id, platform))
`
const TEAM_DETAIL_SELECT_PUBLIC = `
  id, name, tag, logo_url, banner_url, description, status, season_id, division_id, forfeit_count, captain_id, co_captain_id, roster_changes_used, review_note,
  division:divisions(name),
  season:seasons(name, status, max_roster, max_starters, max_subs, max_roster_changes, roster_lock_at),
  members:team_members(id, user_id, role, joined_at, left_at, is_emergency,
    profile:profiles(avatar_url, activision_id, platform))
`

/** Public list of teams in the active season (removed teams hidden). */
export function useTeamList(seasonId?: MaybeRefOrGetter<string | null | undefined>) {
  const teams = ref<TeamSummary[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    const wanted = seasonId === undefined ? undefined : toValue(seasonId)
    if (seasonId !== undefined && !wanted) {
      teams.value = []
      loading.value = false
      return
    }
    const q = supabase
      .from('teams')
      .select(
        'id, name, tag, logo_url, banner_url, status, division_id, division:divisions(name), season:seasons!inner(status), members:team_members(left_at, is_emergency, role, profile:profiles(avatar_url, activision_id))',
      )
      .neq('status', 'removed')
      .order('name')
    const { data, error: err } = wanted ? await q.eq('season_id', wanted) : await q.in('season.status', ['signups', 'regular', 'playoffs'])
    error.value = err ? 'Could not load teams.' : null
    teams.value = (data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      tag: t.tag,
      logoUrl: t.logo_url,
      bannerUrl: t.banner_url,
      status: t.status,
      division: t.division?.name ?? null,
      divisionId: t.division_id,
      rosterSize: t.members.filter((m) => !m.left_at && !m.is_emergency).length,
      starters: t.members
        .filter((m) => !m.left_at && !m.is_emergency && m.role === 'starter')
        .map((m) => ({ avatarUrl: m.profile?.avatar_url ?? null, name: m.profile?.activision_id ?? 'Player' })),
    }))
    loading.value = false
  }

  if (seasonId === undefined) void load()
  else watch(() => toValue(seasonId), load, { immediate: true })
  return { teams, loading, error, reload: load }
}

/** One team with its active roster and the season's roster rules. */
export function useTeam(id: MaybeRefOrGetter<string | null | undefined>) {
  const auth = useAuthStore()
  const team = ref<TeamDetail | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    const teamId = toValue(id)
    if (!teamId) {
      team.value = null
      loading.value = false
      return
    }
    loading.value = true
    const { data, error: err } = auth.isSignedIn
      ? await supabase.from('teams').select(TEAM_DETAIL_SELECT).eq('id', teamId).maybeSingle()
      : await supabase.from('teams').select(TEAM_DETAIL_SELECT_PUBLIC).eq('id', teamId).maybeSingle()
    loading.value = false
    if (err || !data || !data.season) {
      team.value = null
      error.value = err ? 'Could not load this team.' : null
      return
    }
    error.value = null
    const roster = data.members
      .filter((m) => !m.left_at && !m.is_emergency)
      .map<RosterPlayer>((m) => ({
        memberId: m.id,
        userId: m.user_id,
        role: m.role,
        joinedAt: m.joined_at,
        name: playerName({
          discordUsername:
            m.profile && 'discord_username' in m.profile ? (m.profile.discord_username as string | null) : null,
          activisionId: m.profile?.activision_id,
        }),
        avatarUrl: m.profile?.avatar_url ?? null,
        activisionId: m.profile?.activision_id ?? null,
        platform: m.profile?.platform ?? null,
        isCaptain: m.user_id === data.captain_id,
        isCoCaptain: m.user_id === data.co_captain_id,
      }))
    team.value = {
      id: data.id,
      name: data.name,
      tag: data.tag,
      logoUrl: data.logo_url,
      bannerUrl: data.banner_url,
      status: data.status,
      division: data.division?.name ?? null,
      divisionId: data.division_id,
      rosterSize: roster.length,
      starters: roster.filter((p) => p.role === 'starter').map((p) => ({ avatarUrl: p.avatarUrl, name: p.name })),
      seasonId: data.season_id,
      seasonName: data.season.name,
      captainId: data.captain_id,
      coCaptainId: data.co_captain_id,
      rosterChangesUsed: data.roster_changes_used,
      forfeitCount: data.forfeit_count,
      reviewNote: data.review_note,
      description: data.description,
      rules: data.season,
      roster: sortRoster(roster),
    }
  }

  watch([() => toValue(id), () => auth.isSignedIn], load, { immediate: true })
  return { team, loading, error, reload: load }
}

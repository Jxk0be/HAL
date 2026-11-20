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
  status: TeamStatus
  division: string | null
  rosterSize: number
}

export interface TeamDetail extends TeamSummary {
  seasonId: string
  seasonName: string
  captainId: string
  coCaptainId: string | null
  rosterChangesUsed: number
  rules: SeasonRules
  roster: RosterPlayer[]
}

// Discord usernames are only readable when signed in, so there are two selects.
const TEAM_DETAIL_SELECT = `
  id, name, tag, logo_url, status, season_id, captain_id, co_captain_id, roster_changes_used,
  division:divisions(name),
  season:seasons(name, status, max_roster, max_starters, max_subs, max_roster_changes, roster_lock_at),
  members:team_members(id, user_id, role, joined_at, left_at, is_emergency,
    profile:profiles(discord_username, avatar_url, activision_id, platform))
`
const TEAM_DETAIL_SELECT_PUBLIC = `
  id, name, tag, logo_url, status, season_id, captain_id, co_captain_id, roster_changes_used,
  division:divisions(name),
  season:seasons(name, status, max_roster, max_starters, max_subs, max_roster_changes, roster_lock_at),
  members:team_members(id, user_id, role, joined_at, left_at, is_emergency,
    profile:profiles(avatar_url, activision_id, platform))
`

/** Public list of teams in the active season (removed teams hidden). */
export function useTeamList() {
  const teams = ref<TeamSummary[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    const { data, error: err } = await supabase
      .from('teams')
      .select(
        'id, name, tag, logo_url, status, division:divisions(name), season:seasons!inner(status), members:team_members(left_at, is_emergency)',
      )
      .in('season.status', ['signups', 'regular', 'playoffs'])
      .neq('status', 'removed')
      .order('name')
    error.value = err ? 'Could not load teams.' : null
    teams.value = (data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      tag: t.tag,
      logoUrl: t.logo_url,
      status: t.status,
      division: t.division?.name ?? null,
      rosterSize: t.members.filter((m) => !m.left_at && !m.is_emergency).length,
    }))
    loading.value = false
  }

  void load()
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
      status: data.status,
      division: data.division?.name ?? null,
      rosterSize: roster.length,
      seasonId: data.season_id,
      seasonName: data.season.name,
      captainId: data.captain_id,
      coCaptainId: data.co_captain_id,
      rosterChangesUsed: data.roster_changes_used,
      rules: data.season,
      roster: sortRoster(roster),
    }
  }

  watch([() => toValue(id), () => auth.isSignedIn], load, { immediate: true })
  return { team, loading, error, reload: load }
}

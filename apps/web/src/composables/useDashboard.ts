import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useActiveSeason } from './useActiveSeason'
import { useSeasonSchedule, type MatchCardData } from './useMatches'
import { useMyInvites } from './useInvites'
import { useMyEmergencySubRequests } from './useEmergencySubs'
import { useTeamRequests } from './useMatchActions'
import { useTeam } from './useTeams'
import { usePlayerStats, useStandings } from './useStats'
import { useMyFreeAgentPost } from './useFreeAgentPost'
import { getSeasonPhase, nextMilestone, seasonSteps } from '@/lib/seasonPhase'

const SETTLED = ['confirmed', 'forfeit', 'cancelled'] as const
const CHECKIN_OPEN_MS = 15 * 60_000
const CHECKIN_CLOSE_MS = 30 * 60_000

export type NextMatchAction = 'checkin' | 'report' | 'watch' | 'view'

/** What the signed-in player should do next on their own next match. */
export function nextMatchAction(m: MatchCardData, isCaptain: boolean, now = Date.now()): NextMatchAction {
  const start = new Date(m.scheduledAt).getTime()
  if (m.broadcastLive) return 'watch'
  if (isCaptain && now >= start - CHECKIN_OPEN_MS && now <= start + CHECKIN_CLOSE_MS && m.status !== 'disputed') {
    return 'checkin'
  }
  if (isCaptain && now >= start && m.status !== 'disputed') return 'report'
  return 'view'
}

/**
 * Everything the dashboard shows, composed from the existing hooks (each runs its own query in
 * parallel; no dashboard-specific SQL).
 */
export function useDashboard() {
  const auth = useAuthStore()
  const teamId = computed(() => auth.team?.id ?? null)
  const isCaptain = computed(() => Boolean(auth.team?.isCaptain || auth.team?.isCoCaptain))

  const { season } = useActiveSeason()
  const { matches, loading: scheduleLoading } = useSeasonSchedule()
  const { invites, busyId: inviteBusy, respond: respondInvite } = useMyInvites()
  const { requests: esubRequests } = useMyEmergencySubRequests()
  const { requests: reschedules } = useTeamRequests(teamId)
  const { team } = useTeam(teamId)
  const { rows: standings } = useStandings(() => season.value?.id, null)
  const { rows: myStats } = usePlayerStats(() => auth.user?.id)
  const { post: faPost } = useMyFreeAgentPost()

  const myMatches = computed(() =>
    teamId.value ? matches.value.filter((m) => m.home.id === teamId.value || m.away.id === teamId.value) : [],
  )
  const nextMatch = computed(() =>
    myMatches.value.find((m) => !(SETTLED as readonly string[]).includes(m.status)) ?? null,
  )
  const lastResult = computed(
    () => [...myMatches.value].reverse().find((m) => m.status === 'confirmed' || m.status === 'forfeit') ?? null,
  )
  const hasPreseason = computed(() => matches.value.some((m) => m.stage === 'preseason'))

  const now = Date.now()
  const toReport = computed(() =>
    isCaptain.value
      ? myMatches.value.filter(
          (m) =>
            new Date(m.scheduledAt).getTime() <= now &&
            ['checkin_open', 'live', 'awaiting_reports', 'scheduled'].includes(m.status),
        )
      : [],
  )
  const disputed = computed(() => myMatches.value.filter((m) => m.status === 'disputed'))
  const reschedulesForMe = computed(() =>
    isCaptain.value ? reschedules.value.filter((r) => r.teamId !== teamId.value) : [],
  )

  const standing = computed(() => standings.value.find((r) => r.team_id === teamId.value) ?? null)
  const seasonLine = computed(() => myStats.value.find((r) => r.season_id === season.value?.id) ?? null)

  const steps = computed(() => (season.value ? seasonSteps(season.value, hasPreseason.value) : []))
  const phase = computed(() => (season.value ? getSeasonPhase(season.value, new Date(), hasPreseason.value) : null))
  const milestone = computed(() => (season.value ? nextMilestone(season.value) : null))

  const myDivision = computed(() => myMatches.value.find((m) => m.stage !== 'preseason')?.divisionId ?? null)
  const divisionResults = computed(() =>
    matches.value
      .filter((m) => (m.status === 'confirmed' || m.status === 'forfeit') && m.stage !== 'preseason')
      .filter((m) => !myDivision.value || m.divisionId === myDivision.value)
      .slice(-5)
      .reverse(),
  )

  const todoCount = computed(
    () =>
      invites.value.length +
      esubRequests.value.length +
      reschedulesForMe.value.length +
      toReport.value.length +
      disputed.value.length,
  )

  return {
    auth,
    season,
    scheduleLoading,
    isCaptain,
    team,
    nextMatch,
    lastResult,
    invites,
    inviteBusy,
    respondInvite,
    esubRequests,
    reschedulesForMe,
    toReport,
    disputed,
    todoCount,
    standing,
    seasonLine,
    steps,
    phase,
    milestone,
    divisionResults,
    faPost,
  }
}

import { computed, type MaybeRefOrGetter } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useStandings } from './useStats'
import { useMyRecruitInterest, useRecruitBoard } from './useRecruiting'
import { useToast } from './useToast'

/** Records, recruiting posts and the "Interested" action for team cards in a season. */
export function useTeamHub(seasonId: MaybeRefOrGetter<string | null | undefined>) {
  const auth = useAuthStore()
  const toast = useToast()
  const { rows, loading: standingsLoading } = useStandings(seasonId, null)
  const { posts, loading: postsLoading } = useRecruitBoard()
  const { postIds, busy, loading: interestLoading, interested } = useMyRecruitInterest(() => auth.user?.id)
  const loading = computed(() => standingsLoading.value || postsLoading.value || interestLoading.value)

  const records = computed(() => new Map(rows.value.map((r) => [r.team_id, { wins: r.wins, losses: r.losses }])))
  const postByTeam = computed(() => new Map(posts.value.map((p) => [p.teamId, p.postId])))
  /** Players without a team can say they're interested (the database re-checks everything). */
  const canInterest = computed(() => auth.isSignedIn && auth.canPlay && !auth.team)

  async function interest(postId: string) {
    const r = await interested(postId)
    if (!r.ok) toast.error(r.message ?? 'Could not send that.')
    else toast.success('The captains have been told you are interested.')
  }

  return { records, postByTeam, canInterest, interestedIds: postIds, busyPost: busy, loading, interest }
}

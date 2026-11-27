import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { dbErrorMessage } from '@/lib/errors'
import { playerName } from '@/lib/players'
import type { LookingFor, OpenSpots } from '@/lib/recruiting'

/**
 * Team recruiting posts. Writes go through recruit_save / recruit_remove / recruit_interest (the
 * database checks captaincy, open spots and eligibility, and queues the #teams-recruiting card and
 * the team-channel ping).
 */
type Result = { ok: true } | { ok: false; message: string }

export interface RecruitCard {
  postId: string
  teamId: string
  teamName: string
  teamTag: string
  logoUrl: string | null
  pending: boolean
  lookingFor: LookingFor
  /** Empty = any role. */
  roles: string[]
  availability: string | null
  note: string | null
  updatedAt: string
  spots: OpenSpots
}

/** Teams recruiting page: every active post with the team's open spots. */
export function useRecruitBoard() {
  const posts = ref<RecruitCard[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    const { data, error: err } = await supabase.rpc('recruit_board')
    loading.value = false
    if (err) {
      error.value = dbErrorMessage(err, 'Could not load the recruiting posts.')
      return
    }
    error.value = null
    posts.value = (data ?? []).map((r) => ({
      postId: r.post_id,
      teamId: r.team_id,
      teamName: r.team_name,
      teamTag: r.team_tag,
      logoUrl: r.logo_url,
      pending: r.team_status === 'pending',
      lookingFor: r.looking_for as LookingFor,
      roles: r.roles ?? [],
      availability: r.availability,
      note: r.note,
      updatedAt: r.updated_at,
      spots: { open: r.open, startersOpen: r.starters_open, subsOpen: r.subs_open },
    }))
  }

  void load()
  return { posts, loading, error, reload: load }
}

/** Post IDs the signed-in player has already said they're interested in. */
export function useMyRecruitInterest(userId: () => string | null | undefined) {
  const postIds = ref(new Set<string>())
  const busy = ref<string | null>(null)

  async function load() {
    const uid = userId()
    if (!uid) {
      postIds.value = new Set()
      return
    }
    const { data } = await supabase.from('team_recruit_interest').select('post_id').eq('user_id', uid)
    postIds.value = new Set((data ?? []).map((r) => r.post_id))
  }

  async function interested(postId: string): Promise<Result> {
    busy.value = postId
    const { error } = await supabase.rpc('recruit_interest', { p_post_id: postId })
    busy.value = null
    if (error) return { ok: false, message: dbErrorMessage(error, 'Could not send that.') }
    postIds.value = new Set([...postIds.value, postId])
    return { ok: true }
  }

  watch(userId, load, { immediate: true })
  return { postIds, busy, interested }
}

export interface MyRecruitPost {
  id: string
  lookingFor: LookingFor
  roles: string[]
  availability: string | null
  note: string | null
  updatedAt: string
}

export interface InterestedPlayer {
  id: string
  name: string
  activisionId: string | null
  avatarUrl: string | null
  platform: string | null
  at: string
}

export interface RecruitInput {
  lookingFor: LookingFor
  roles: string[]
  availability: string | null
  note: string | null
}

/** My team → Looking for players: the team's active post, who's interested, and the open spots. */
export function useTeamRecruitPost(teamId: () => string | null | undefined) {
  const post = ref<MyRecruitPost | null>(null)
  const interested = ref<InterestedPlayer[]>([])
  const spots = ref<OpenSpots>({ open: 0, startersOpen: 0, subsOpen: 0 })
  const loading = ref(true)
  const saving = ref(false)

  async function load() {
    const id = teamId()
    if (!id) {
      post.value = null
      interested.value = []
      loading.value = false
      return
    }
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase
        .from('team_recruit_posts')
        .select('id, looking_for, roles, availability, note, updated_at')
        .eq('team_id', id)
        .eq('active', true)
        .maybeSingle(),
      supabase.rpc('team_open_spots', { p_team_id: id }),
    ])
    const sp = Array.isArray(s) ? s[0] : s
    spots.value = { open: sp?.open ?? 0, startersOpen: sp?.starters_open ?? 0, subsOpen: sp?.subs_open ?? 0 }
    post.value = p
      ? { id: p.id, lookingFor: p.looking_for as LookingFor, roles: p.roles ?? [], availability: p.availability, note: p.note, updatedAt: p.updated_at }
      : null
    if (p) {
      const { data: rows } = await supabase
        .from('team_recruit_interest')
        .select('created_at, player:profiles(id, discord_username, activision_id, avatar_url, platform)')
        .eq('post_id', p.id)
        .order('created_at', { ascending: false })
      interested.value = (rows ?? []).flatMap((r) =>
        r.player
          ? [
              {
                id: r.player.id,
                name: playerName({ discordUsername: r.player.discord_username, activisionId: r.player.activision_id }),
                activisionId: r.player.activision_id,
                avatarUrl: r.player.avatar_url,
                platform: r.player.platform,
                at: r.created_at,
              },
            ]
          : [],
      )
    } else {
      interested.value = []
    }
    loading.value = false
  }

  async function save(teamIdValue: string, v: RecruitInput): Promise<Result> {
    saving.value = true
    const { error } = await supabase.rpc('recruit_save', {
      p_team_id: teamIdValue,
      p_looking_for: v.lookingFor,
      p_roles: v.roles,
      p_availability: v.availability ?? '',
      p_note: v.note ?? '',
    })
    saving.value = false
    if (error) return { ok: false, message: dbErrorMessage(error, 'Could not save the post.') }
    await load()
    return { ok: true }
  }

  async function remove(): Promise<Result> {
    if (!post.value) return { ok: true }
    saving.value = true
    const { error } = await supabase.rpc('recruit_remove', { p_post_id: post.value.id })
    saving.value = false
    if (error) return { ok: false, message: dbErrorMessage(error, 'Could not take the post down.') }
    await load()
    return { ok: true }
  }

  watch(teamId, load, { immediate: true })
  return { post, interested, spots, loading, saving, save, remove, reload: load }
}

/** Admins take any post down from the Teams recruiting page. */
export async function removeRecruitPost(postId: string): Promise<Result> {
  const { error } = await supabase.rpc('recruit_remove', { p_post_id: postId })
  return error ? { ok: false, message: dbErrorMessage(error) } : { ok: true }
}

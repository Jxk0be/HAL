import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { dbErrorMessage } from '@/lib/errors'
import type { Database } from '@/types/database'

type Post = Pick<
  Database['public']['Tables']['free_agent_posts']['Row'],
  'id' | 'platform' | 'preferred_role' | 'availability' | 'note' | 'active' | 'updated_at'
>
export interface PostInput {
  preferred_role: string | null
  availability: string | null
  note: string | null
}

const POST_COLUMNS = 'id, platform, preferred_role, availability, note, active, updated_at'

/** The signed-in player's active free agent post: create, edit, take down. */
export function useMyFreeAgentPost() {
  const auth = useAuthStore()
  const post = ref<Post | null>(null)
  const loading = ref(true)
  const saving = ref(false)

  async function load() {
    const uid = auth.user?.id
    if (!uid) {
      post.value = null
      loading.value = false
      return
    }
    loading.value = true
    const { data } = await supabase
      .from('free_agent_posts')
      .select(POST_COLUMNS)
      .eq('user_id', uid)
      .eq('active', true)
      .maybeSingle()
    post.value = data
    loading.value = false
  }

  async function save(input: PostInput, seasonId: string | null) {
    const uid = auth.user?.id
    const platform = auth.profile?.platform
    if (!uid || !platform) return { ok: false as const, message: 'Finish your profile first.' }
    saving.value = true
    const body = {
      preferred_role: input.preferred_role || null,
      availability: input.availability?.trim() || null,
      note: input.note?.trim() || null,
      platform,
    }
    const { error } = post.value
      ? await supabase.from('free_agent_posts').update(body).eq('id', post.value.id)
      : await supabase.from('free_agent_posts').insert({ ...body, user_id: uid, season_id: seasonId, active: true })
    saving.value = false
    if (error) return { ok: false as const, message: dbErrorMessage(error, 'Could not save your post.') }
    await Promise.all([load(), auth.refresh()])
    return { ok: true as const }
  }

  async function takeDown() {
    if (!post.value) return { ok: true as const }
    saving.value = true
    const { error } = await supabase.from('free_agent_posts').update({ active: false }).eq('id', post.value.id)
    saving.value = false
    if (error) return { ok: false as const, message: dbErrorMessage(error, 'Could not take your post down.') }
    await load()
    return { ok: true as const }
  }

  watch(() => auth.user?.id, load, { immediate: true })
  return { post, loading, saving, save, takeDown }
}

/** Staff moderation of any free agent post (audit-logged by the database). */
export function useFreeAgentModeration() {
  const busy = ref(false)
  async function run(fn: () => PromiseLike<{ error: { code?: string; message: string } | null }>) {
    busy.value = true
    const { error } = await fn()
    busy.value = false
    return error ? { ok: false as const, message: dbErrorMessage(error) } : { ok: true as const }
  }
  return {
    busy,
    hide: (postId: string) => run(() => supabase.from('free_agent_posts').update({ active: false }).eq('id', postId)),
    remove: (postId: string) => run(() => supabase.from('free_agent_posts').delete().eq('id', postId)),
  }
}

/** Open spots on the viewer's team (for showing Invite buttons). */
export function useOpenSpots(teamId: () => string | null | undefined) {
  const open = ref(0)
  const loading = ref(true)
  async function load() {
    const id = teamId()
    if (!id) {
      open.value = 0
      loading.value = false
      return
    }
    const { data } = await supabase.rpc('team_open_spots', { p_team_id: id })
    open.value = data?.[0]?.open ?? 0
    loading.value = false
  }
  watch(teamId, load, { immediate: true })
  return { open, loading, reload: load }
}

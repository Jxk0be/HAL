import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Database } from '@/types/database'
import { normalizeActivisionId, profileErrorMessage } from '@/lib/validation/profile'

type ProfileUpdate = Pick<
  Database['public']['Tables']['profiles']['Update'],
  | 'activision_id'
  | 'platform'
  | 'is_free_agent'
  | 'age_confirmed_at'
  | 'controller_confirmed_at'
  | 'cod_rank'
  | 'bio'
  | 'main_role'
  | 'profile_color'
  | 'twitch_handle'
  | 'youtube_handle'
  | 'x_handle'
  | 'tiktok_handle'
>

/** Save the signed-in player's own profile. Confirmation timestamps are stamped by the server. */
export function useMyProfile() {
  const auth = useAuthStore()
  const saving = ref(false)
  const error = ref<string | null>(null)

  async function save(patch: ProfileUpdate): Promise<boolean> {
    const uid = auth.user?.id
    if (!uid) return false
    saving.value = true
    error.value = null
    const body: ProfileUpdate = { ...patch }
    if (typeof body.activision_id === 'string') body.activision_id = normalizeActivisionId(body.activision_id)

    const { error: err } = await supabase.from('profiles').update(body).eq('id', uid)
    saving.value = false
    if (err) {
      error.value = profileErrorMessage(err)
      return false
    }
    await auth.refresh()
    return true
  }

  return { save, saving, error }
}

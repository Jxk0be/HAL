import { ref, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { dbErrorMessage } from '@/lib/errors'
import type { MemberRole } from '@/lib/teams'

export interface MyInvite {
  id: string
  role: MemberRole | null
  expiresAt: string
  team: { id: string; name: string; tag: string; logoUrl: string | null }
  captainName: string | null
}

export interface SentInvite {
  id: string
  role: MemberRole | null
  expiresAt: string
  player: { id: string; name: string; avatarUrl: string | null; activisionId: string | null }
}

/** The signed-in player's pending invites, with accept/decline. */
export function useMyInvites() {
  const auth = useAuthStore()
  const invites = ref<MyInvite[]>([])
  const loading = ref(true)
  const busyId = ref<string | null>(null)

  async function load() {
    const uid = auth.user?.id
    if (!uid) {
      invites.value = []
      loading.value = false
      return
    }
    loading.value = true
    const { data } = await supabase
      .from('team_invites')
      .select('id, role, expires_at, team:teams(id, name, tag, logo_url, captain:profiles!teams_captain_id_fkey(discord_username))')
      .eq('user_id', uid)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    invites.value = (data ?? []).map((i) => ({
      id: i.id,
      role: i.role,
      expiresAt: i.expires_at,
      team: { id: i.team.id, name: i.team.name, tag: i.team.tag, logoUrl: i.team.logo_url },
      captainName: i.team.captain?.discord_username ?? null,
    }))
    loading.value = false
  }

  async function respond(inviteId: string, accept: boolean) {
    busyId.value = inviteId
    const { error } = await supabase.rpc('respond_to_invite', { p_invite_id: inviteId, p_accept: accept })
    busyId.value = null
    if (error) return { ok: false as const, message: dbErrorMessage(error) }
    await Promise.all([load(), accept ? auth.refresh() : Promise.resolve()])
    return { ok: true as const }
  }

  watch(() => auth.user?.id, load, { immediate: true })
  return { invites, loading, busyId, respond, reload: load }
}

/** Pending invites a team has sent (visible to its captains). */
export function useTeamInvites(teamId: MaybeRefOrGetter<string | null | undefined>) {
  const invites = ref<SentInvite[]>([])
  const loading = ref(true)

  async function load() {
    const id = toValue(teamId)
    if (!id) {
      invites.value = []
      loading.value = false
      return
    }
    const { data } = await supabase
      .from('team_invites')
      .select('id, role, expires_at, player:profiles!team_invites_user_id_fkey(id, discord_username, avatar_url, activision_id)')
      .eq('team_id', id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    invites.value = (data ?? []).map((i) => ({
      id: i.id,
      role: i.role,
      expiresAt: i.expires_at,
      player: {
        id: i.player.id,
        name: i.player.discord_username ?? 'Player',
        avatarUrl: i.player.avatar_url,
        activisionId: i.player.activision_id,
      },
    }))
    loading.value = false
  }

  watch(() => toValue(teamId), load, { immediate: true })
  return { invites, loading, reload: load }
}

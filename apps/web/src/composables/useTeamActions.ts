import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { dbErrorMessage } from '@/lib/errors'
import type { MemberRole } from '@/lib/teams'

const TAKEN = 'That team name or tag is already taken this season.'

type Result = { ok: true } | { ok: false; message: string }

/**
 * Captain and player roster actions. Every rule (roster size, role caps, one team per season,
 * roster lock, change limits) is enforced in Postgres; these just call it and translate errors.
 */
export function useTeamActions() {
  const auth = useAuthStore()
  const busy = ref(false)

  async function run(fn: () => PromiseLike<{ error: { code?: string; message: string } | null }>, unique?: string): Promise<Result> {
    busy.value = true
    const { error } = await fn()
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error, undefined, unique) }
    return { ok: true }
  }

  async function createTeam(input: { seasonId: string; name: string; tag: string; description?: string | null }) {
    const uid = auth.user?.id
    if (!uid) return { ok: false, message: 'Log in first.' } as const
    busy.value = true
    const { data, error } = await supabase
      .from('teams')
      .insert({
        season_id: input.seasonId,
        name: input.name.trim(),
        tag: input.tag.trim(),
        description: input.description ?? null,
        captain_id: uid,
      })
      .select('id')
      .single()
    busy.value = false
    if (error) return { ok: false, message: dbErrorMessage(error, 'Could not create the team.', TAKEN) } as const
    await auth.refresh()
    return { ok: true, id: data.id } as const
  }

  const updateTeam = (
    teamId: string,
    patch: { name?: string; tag?: string; logo_url?: string | null; description?: string | null },
  ) =>
    run(() => supabase.from('teams').update(patch).eq('id', teamId), TAKEN)

  async function uploadLogo(teamId: string, file: File): Promise<Result> {
    busy.value = true
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${teamId}/logo-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('team-logos').upload(path, file, {
      contentType: file.type,
      cacheControl: '31536000',
    })
    busy.value = false
    if (error) return { ok: false, message: 'Could not upload the logo. Use a PNG, JPG or WebP under 1 MB.' }
    const { data } = supabase.storage.from('team-logos').getPublicUrl(path)
    return updateTeam(teamId, { logo_url: data.publicUrl })
  }

  const setRole = (memberId: string, role: MemberRole) =>
    run(() => supabase.from('team_members').update({ role }).eq('id', memberId))

  const setCoCaptain = (teamId: string, userId: string | null) =>
    run(() => supabase.from('teams').update({ co_captain_id: userId }).eq('id', teamId))

  const transferCaptaincy = (teamId: string, userId: string) =>
    run(() => supabase.rpc('transfer_captaincy', { p_team_id: teamId, p_new_captain: userId }))

  const removePlayer = (teamId: string, userId: string) =>
    run(() => supabase.rpc('remove_player', { p_team_id: teamId, p_user_id: userId }))

  async function leaveTeam(teamId: string) {
    const result = await run(() => supabase.rpc('leave_team', { p_team_id: teamId }))
    if (result.ok) await auth.refresh()
    return result
  }

  /** Captain only: every player (captain included) becomes a free agent; see disband_team(). */
  async function disbandTeam(teamId: string) {
    const result = await run(() => supabase.rpc('disband_team', { p_team_id: teamId }))
    if (result.ok) await auth.refresh()
    return result
  }

  const invite = (teamId: string, userId: string, role?: MemberRole) =>
    run(() => supabase.rpc('invite_player', { p_team_id: teamId, p_user_id: userId, p_role: role }))

  const cancelInvite = (inviteId: string) => run(() => supabase.rpc('cancel_invite', { p_invite_id: inviteId }))

  return {
    busy,
    createTeam,
    updateTeam,
    uploadLogo,
    setRole,
    setCoCaptain,
    transferCaptaincy,
    removePlayer,
    leaveTeam,
    disbandTeam,
    invite,
    cancelInvite,
  }
}

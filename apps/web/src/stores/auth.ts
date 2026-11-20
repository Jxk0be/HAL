import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { isProfileComplete } from '@/lib/validation/profile'

type StaffRole = Database['public']['Enums']['staff_role']
type ProfileRow = Database['public']['Tables']['profiles']['Row']

/** Every profile column except discord_id (hidden from the API by column privileges). */
export const PROFILE_COLUMNS =
  'id, discord_username, avatar_url, activision_id, platform, age_confirmed_at, controller_confirmed_at, pov_ack_at, is_free_agent, banned_until, created_at, updated_at'
export type MyProfile = Omit<ProfileRow, 'discord_id'>

export interface MyTeam {
  id: string
  name: string
  tag: string
  logo_url: string | null
  status: Database['public']['Enums']['team_status']
  role: Database['public']['Enums']['member_role']
  isCaptain: boolean
  isCoCaptain: boolean
  seasonName: string
}

const ACTIVE_SEASON = ['signups', 'regular', 'playoffs'] as const

/**
 * Session, profile, staff roles and current-season team. Loaded on app start and whenever the
 * signed-in user changes. Stores may import `supabase`; components go through stores/composables.
 */
export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const roles = ref<StaffRole[]>([])
  const profile = ref<MyProfile | null>(null)
  const team = ref<MyTeam | null>(null)
  const ready = ref(false)
  let initPromise: Promise<void> | null = null

  const user = computed(() => session.value?.user ?? null)
  const isSignedIn = computed(() => user.value !== null)

  const displayName = computed(() => {
    if (profile.value?.discord_username) return profile.value.discord_username
    const meta = user.value?.user_metadata ?? {}
    const claims = (meta.custom_claims ?? {}) as Record<string, unknown>
    const name = claims.global_name ?? meta.full_name ?? meta.name ?? meta.user_name
    return typeof name === 'string' ? name : 'Player'
  })
  const avatarUrl = computed(() => {
    if (profile.value?.avatar_url) return profile.value.avatar_url
    const url = user.value?.user_metadata?.avatar_url
    return typeof url === 'string' ? url : null
  })

  const isOwner = computed(() => roles.value.includes('owner'))
  const isAdmin = computed(() => isOwner.value || roles.value.includes('admin'))
  const isCaster = computed(() => roles.value.includes('caster'))
  const isStaff = computed(() => roles.value.length > 0)

  const isOnboarded = computed(() => isProfileComplete(profile.value))
  const bannedUntil = computed(() => {
    const until = profile.value?.banned_until
    return until && new Date(until).getTime() > Date.now() ? new Date(until) : null
  })
  const isBanned = computed(() => bannedUntil.value !== null)

  async function loadRoles(uid: string) {
    const { data, error } = await supabase.from('staff_roles').select('role').eq('user_id', uid)
    roles.value = error ? [] : data.map((r) => r.role)
  }

  async function loadProfile(uid: string) {
    const { data } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', uid).maybeSingle()
    profile.value = data
  }

  async function loadTeam(uid: string) {
    const { data } = await supabase
      .from('team_members')
      .select(
        'role, team:teams!inner(id, name, tag, logo_url, status, captain_id, co_captain_id, season:seasons!inner(name, status))',
      )
      .eq('user_id', uid)
      .is('left_at', null)
      .eq('is_emergency', false)
    const row = (data ?? []).find((r) =>
      (ACTIVE_SEASON as readonly string[]).includes(r.team.season.status),
    )
    team.value = row
      ? {
          id: row.team.id,
          name: row.team.name,
          tag: row.team.tag,
          logo_url: row.team.logo_url,
          status: row.team.status,
          role: row.role,
          isCaptain: row.team.captain_id === uid,
          isCoCaptain: row.team.co_captain_id === uid,
          seasonName: row.team.season.name,
        }
      : null
  }

  /** Reload everything about the signed-in user (after saving the profile, joining a team, ...). */
  async function refresh() {
    const uid = session.value?.user.id
    if (!uid) {
      roles.value = []
      profile.value = null
      team.value = null
      return
    }
    await Promise.all([loadRoles(uid), loadProfile(uid), loadTeam(uid)])
  }

  /** Load the current session once; safe to call from guards and components. */
  function init() {
    initPromise ??= (async () => {
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      await refresh()
      ready.value = true
      supabase.auth.onAuthStateChange((_event, next) => {
        const changedUser = next?.user.id !== session.value?.user.id
        session.value = next
        // Don't await Supabase calls inside the auth callback (it can deadlock the client).
        if (changedUser) setTimeout(() => void refresh(), 0)
      })
    })()
    return initPromise
  }

  /**
   * Discord OAuth. Supabase needs the account email to create the user (it is never shown or
   * stored in public tables), so we ask for `identify email`.
   */
  async function signInWithDiscord(nextPath = '/') {
    const next = encodeURIComponent(nextPath)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        scopes: 'identify email',
        redirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      },
    })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
    roles.value = []
    profile.value = null
    team.value = null
  }

  return {
    session,
    user,
    roles,
    profile,
    team,
    ready,
    isSignedIn,
    displayName,
    avatarUrl,
    isOwner,
    isAdmin,
    isCaster,
    isStaff,
    isOnboarded,
    isBanned,
    bannedUntil,
    init,
    refresh,
    signInWithDiscord,
    signOut,
  }
})

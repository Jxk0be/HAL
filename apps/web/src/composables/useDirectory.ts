import { computed, ref, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { supabase } from '@/lib/supabase'
import type { CodRank } from '@/lib/validation/profile'
import { useAuthStore } from '@/stores/auth'
import type { MemberRole, Platform } from '@/lib/teams'
import { PAGE_SIZE, playerName, type FreeAgentRole } from '@/lib/players'

export interface FreeAgentCard {
  id: string
  name: string
  discordUsername: string | null
  avatarUrl: string | null
  activisionId: string | null
  platform: Platform | null
  role: string | null
  availability: string | null
  note: string | null
  postId: string | null
  postedAt: string | null
}

export interface DirectoryPlayer {
  id: string
  name: string
  discordUsername: string | null
  avatarUrl: string | null
  activisionId: string | null
  platform: Platform | null
  isFreeAgent: boolean
  banned: boolean
  team: { id: string; name: string; tag: string; logoUrl: string | null } | null
  teamRole: MemberRole | null
  isCaptain: boolean
  isCoCaptain: boolean
}

/** Paginated, filterable Free Agents board (30 per page). Reloads when the viewer signs in/out. */
export function useFreeAgentBoard() {
  const auth = useAuthStore()
  const search = ref('')
  const platform = ref<Platform | ''>('')
  const role = ref<FreeAgentRole | ''>('')
  const page = ref(0)
  const rows = ref<FreeAgentCard[]>([])
  const total = ref(0)
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    const { data, error: err } = await supabase.rpc('free_agent_board', {
      p_search: search.value.trim() || undefined,
      p_platform: platform.value || undefined,
      p_role: role.value || undefined,
      p_limit: PAGE_SIZE,
      p_offset: page.value * PAGE_SIZE,
    })
    loading.value = false
    error.value = err ? 'Could not load free agents.' : null
    total.value = Number(data?.[0]?.total_count ?? 0)
    rows.value = (data ?? []).map((r) => ({
      id: r.id,
      name: playerName({ discordUsername: r.discord_username, activisionId: r.activision_id }),
      discordUsername: r.discord_username,
      avatarUrl: r.avatar_url,
      activisionId: r.activision_id,
      platform: r.platform,
      role: r.preferred_role,
      availability: r.availability,
      note: r.note,
      postId: r.post_id,
      postedAt: r.posted_at,
    }))
  }

  watch([platform, role], () => {
    page.value = 0
    void load()
  })
  watchDebounced(search, () => {
    page.value = 0
    void load()
  }, { debounce: 250 })
  watch(page, load)
  watch(() => auth.isSignedIn, load, { immediate: true })

  const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
  return { search, platform, role, page, pages, rows, total, loading, error, reload: load }
}

function mapPlayer(r: {
  id: string
  discord_username: string | null
  avatar_url: string | null
  activision_id: string | null
  platform: Platform | null
  is_free_agent: boolean
  banned: boolean
  team_id: string | null
  team_name: string | null
  team_tag: string | null
  team_logo_url: string | null
  team_role: MemberRole | null
  is_captain: boolean
  is_co_captain: boolean
}): DirectoryPlayer {
  return {
    id: r.id,
    name: playerName({ discordUsername: r.discord_username, activisionId: r.activision_id }),
    discordUsername: r.discord_username,
    avatarUrl: r.avatar_url,
    activisionId: r.activision_id,
    platform: r.platform,
    isFreeAgent: r.is_free_agent,
    banned: r.banned,
    team:
      r.team_id && r.team_name && r.team_tag
        ? { id: r.team_id, name: r.team_name, tag: r.team_tag, logoUrl: r.team_logo_url }
        : null,
    teamRole: r.team_role,
    isCaptain: r.is_captain,
    isCoCaptain: r.is_co_captain,
  }
}

/** Paginated, searchable Players directory. */
export function usePlayerDirectory() {
  const auth = useAuthStore()
  const search = ref('')
  const page = ref(0)
  const players = ref<DirectoryPlayer[]>([])
  const total = ref(0)
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    const { data, error: err } = await supabase.rpc('player_directory', {
      p_search: search.value.trim() || undefined,
      p_limit: PAGE_SIZE,
      p_offset: page.value * PAGE_SIZE,
    })
    loading.value = false
    error.value = err ? 'Could not load players.' : null
    total.value = Number(data?.[0]?.total_count ?? 0)
    players.value = (data ?? []).map(mapPlayer)
  }

  watchDebounced(search, () => {
    page.value = 0
    void load()
  }, { debounce: 250 })
  watch(page, load)
  watch(() => auth.isSignedIn, load, { immediate: true })

  const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
  return { search, page, pages, players, total, loading, error }
}

/** One player for the player page. */
export function usePlayer(id: MaybeRefOrGetter<string | null | undefined>) {
  const auth = useAuthStore()
  const player = ref<DirectoryPlayer | null>(null)
  /** Ranked-play rank (rules 2.8–2.9), public. */
  const rank = ref<{ rank: CodRank | null; exceptionAt: string | null } | null>(null)
  const loading = ref(true)

  async function load() {
    const playerId = toValue(id)
    if (!playerId) {
      player.value = null
      rank.value = null
      loading.value = false
      return
    }
    loading.value = true
    const [{ data }, { data: r }] = await Promise.all([
      supabase.rpc('player_directory', { p_player_id: playerId, p_limit: 1 }),
      supabase.from('profiles').select('cod_rank, rank_exception_at').eq('id', playerId).maybeSingle(),
    ])
    player.value = data?.[0] ? mapPlayer(data[0]) : null
    rank.value = r ? { rank: r.cod_rank, exceptionAt: r.rank_exception_at } : null
    loading.value = false
  }

  watch([() => toValue(id), () => auth.isSignedIn], load, { immediate: true })
  return { player, rank, loading }
}

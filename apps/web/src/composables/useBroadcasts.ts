import { effectScope, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { supabase } from '@/lib/supabase'
import { dbErrorMessage } from '@/lib/errors'
import { useRealtime } from './useRealtime'
import type { Database } from '@/types/database'

type Result = { ok: true } | { ok: false; message: string }

export interface LiveBroadcast {
  matchId: string
  homeTag: string
  awayTag: string
  homeName: string
  awayName: string
  url: string
  caster: string
  startedAt: string | null
}

// One shared list and one realtime channel for the whole app (banner, home page, cards).
const live = ref<LiveBroadcast[]>([])
const loaded = ref(false)
let started = false

async function loadLive() {
  const { data } = await supabase.rpc('live_broadcasts')
  live.value = (data ?? []).map((b) => ({
    matchId: b.match_id,
    homeTag: b.home_tag,
    awayTag: b.away_tag,
    homeName: b.home_name,
    awayName: b.away_name,
    url: b.url,
    caster: b.caster,
    startedAt: b.started_at,
  }))
  loaded.value = true
}

/** Matches being streamed right now, kept live by realtime (no polling). */
export function useLiveBroadcasts() {
  if (!started) {
    started = true
    // Detached scope: the subscription lives as long as the app, not the first component.
    effectScope(true).run(() => useRealtime('live-broadcasts', [{ table: 'matches' }], () => void loadLive(), 250))
    void loadLive()
  }
  return { live, loaded, reload: loadLive }
}

/** Caster names for claimed or finished broadcasts (public). */
export async function loadCasters(matchIds: string[]): Promise<Record<string, string>> {
  if (!matchIds.length) return {}
  const { data } = await supabase.rpc('broadcast_casters', { p_match_ids: matchIds })
  return Object.fromEntries((data ?? []).map((r) => [r.match_id, r.caster]))
}

async function run(p: PromiseLike<{ error: { code?: string; message: string } | null }>): Promise<Result> {
  const { error } = await p
  return error ? { ok: false, message: dbErrorMessage(error) } : { ok: true }
}

export const broadcastActions = {
  goLive: (matchId: string, url: string) => run(supabase.rpc('set_broadcast', { p_match_id: matchId, p_live: true, p_url: url.trim() })),
  end: (matchId: string) => run(supabase.rpc('set_broadcast', { p_match_id: matchId, p_live: false })),
  claim: (matchId: string, claim: boolean) => run(supabase.rpc('claim_broadcast', { p_match_id: matchId, p_claim: claim })),
}

export interface CastingMatch {
  id: string
  week: number
  status: Database['public']['Enums']['match_status']
  scheduledAt: string
  home: { id: string; tag: string; name: string }
  away: { id: string; tag: string; name: string }
  live: boolean
  url: string | null
  casterId: string | null
  caster: string | null
}

/** Today's and upcoming matches (next `days` days) for the casting desk, plus anything live. */
export function useCastingDesk(days: MaybeRefOrGetter<number> = 7) {
  const matches = ref<CastingMatch[]>([])
  const loading = ref(true)

  async function load() {
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    const to = new Date(from.getTime() + toValue(days) * 86_400_000)
    const { data } = await supabase
      .from('matches')
      .select('id, week, status, scheduled_at, broadcast_live, broadcast_url, broadcast_by, home:teams!matches_home_team_id_fkey(id, tag, name), away:teams!matches_away_team_id_fkey(id, tag, name)')
      .or(`broadcast_live.eq.true,and(scheduled_at.gte.${from.toISOString()},scheduled_at.lt.${to.toISOString()})`)
      .neq('status', 'cancelled')
      .order('scheduled_at')
    const rows = data ?? []
    const names = await loadCasters(rows.filter((m) => m.broadcast_by).map((m) => m.id))
    matches.value = rows.map((m) => ({
      id: m.id,
      week: m.week,
      status: m.status,
      scheduledAt: m.scheduled_at,
      home: m.home,
      away: m.away,
      live: m.broadcast_live,
      url: m.broadcast_url,
      casterId: m.broadcast_by,
      caster: names[m.id] ?? null,
    }))
    loading.value = false
  }

  useRealtime('casting-desk', [{ table: 'matches' }], () => void load())
  watch(() => toValue(days), load, { immediate: true })
  return { matches, loading, reload: load }
}

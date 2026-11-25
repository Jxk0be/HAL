import { ref, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { supabase } from '@/lib/supabase'
import { dbErrorMessage } from '@/lib/errors'

/**
 * Preseason matches: interest, pairings and proposed times. Every rule lives in the preseason_*
 * database functions; these wrap the reads and translate errors.
 */

type Result = { ok: true } | { ok: false; message: string }
type ProposalStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'

export interface PreseasonTeam {
  id: string
  name: string
  tag: string
  logoUrl: string | null
}

export interface PreseasonProposal {
  id: string
  teamId: string
  proposedAt: string
  status: ProposalStatus
  createdAt: string
}

export interface PreseasonPairing {
  id: string
  status: 'unscheduled' | 'scheduled' | 'cancelled'
  home: PreseasonTeam
  away: PreseasonTeam
  match: { id: string; status: string; scheduledAt: string } | null
  hasChannel: boolean
  proposals: PreseasonProposal[]
  pending: PreseasonProposal | null
}

export interface PreseasonSeason {
  id: string
  name: string
  status: string
  startsOn: string | null
  timezone: string
  invitesAt: string | null
  generatedAt: string | null
}

const PAIRING_SELECT =
  'id, status, discord_channel_id, created_at, ' +
  'home:teams!preseason_pairings_home_team_id_fkey(id, name, tag, logo_url), ' +
  'away:teams!preseason_pairings_away_team_id_fkey(id, name, tag, logo_url), ' +
  'match:matches(id, status, scheduled_at), ' +
  'proposals:preseason_proposals(id, team_id, proposed_at, status, created_at)'

interface PairingRow {
  id: string
  status: PreseasonPairing['status']
  discord_channel_id: string | null
  home: { id: string; name: string; tag: string; logo_url: string | null }
  away: { id: string; name: string; tag: string; logo_url: string | null }
  match: { id: string; status: string; scheduled_at: string } | null
  proposals: { id: string; team_id: string; proposed_at: string; status: ProposalStatus; created_at: string }[]
}

const team = (t: PairingRow['home']): PreseasonTeam => ({ id: t.id, name: t.name, tag: t.tag, logoUrl: t.logo_url })

function toPairing(p: PairingRow): PreseasonPairing {
  const proposals = p.proposals
    .map((x) => ({ id: x.id, teamId: x.team_id, proposedAt: x.proposed_at, status: x.status, createdAt: x.created_at }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return {
    id: p.id,
    status: p.status,
    home: team(p.home),
    away: team(p.away),
    match: p.match ? { id: p.match.id, status: p.match.status, scheduledAt: p.match.scheduled_at } : null,
    hasChannel: Boolean(p.discord_channel_id),
    proposals,
    pending: proposals.find((x) => x.status === 'pending') ?? null,
  }
}

async function loadSeason(seasonId: string): Promise<PreseasonSeason | null> {
  const { data } = await supabase
    .from('seasons')
    .select('id, name, status, starts_on, timezone, preseason_invites_at, preseason_generated_at')
    .eq('id', seasonId)
    .maybeSingle()
  return data
    ? {
        id: data.id,
        name: data.name,
        status: data.status,
        startsOn: data.starts_on,
        timezone: data.timezone,
        invitesAt: data.preseason_invites_at,
        generatedAt: data.preseason_generated_at,
      }
    : null
}

/** Other matches this season (for warning about the 2-hour gap before sending a time). */
async function loadSeasonMatchTimes(seasonId: string) {
  const { data } = await supabase
    .from('matches')
    .select('id, scheduled_at, home:teams!matches_home_team_id_fkey(tag), away:teams!matches_away_team_id_fkey(tag)')
    .eq('season_id', seasonId)
    .neq('status', 'cancelled')
  return (data ?? []).map((m) => ({ id: m.id, scheduledAt: m.scheduled_at, label: `${m.home.tag} vs ${m.away.tag}` }))
}

const call = async (p: PromiseLike<{ error: { code?: string; message: string } | null }>, fallback: string): Promise<Result> => {
  const { error } = await p
  return error ? { ok: false, message: dbErrorMessage(error, fallback) } : { ok: true }
}

/** A captain's view: their invite answer and their preseason matches. */
export function useTeamPreseason(teamId: MaybeRefOrGetter<string | null | undefined>, seasonId: MaybeRefOrGetter<string | null | undefined>) {
  const season = ref<PreseasonSeason | null>(null)
  const invited = ref(false)
  const interested = ref<boolean | null>(null)
  const pairings = ref<PreseasonPairing[]>([])
  const otherMatches = ref<{ id: string; scheduledAt: string; label: string }[]>([])
  const loading = ref(true)
  const busy = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const t = toValue(teamId)
    const s = toValue(seasonId)
    if (!t || !s) {
      loading.value = false
      return
    }
    loading.value = true
    const [seasonRow, { data: interest, error: e1 }, { data: rows, error: e2 }, times] = await Promise.all([
      loadSeason(s),
      supabase.from('preseason_interest').select('interested').eq('team_id', t).maybeSingle(),
      supabase.from('preseason_pairings').select(PAIRING_SELECT).or(`home_team_id.eq.${t},away_team_id.eq.${t}`).order('created_at'),
      loadSeasonMatchTimes(s),
    ])
    season.value = seasonRow
    invited.value = Boolean(interest)
    interested.value = interest?.interested ?? null
    pairings.value = ((rows ?? []) as unknown as PairingRow[]).map(toPairing)
    otherMatches.value = times
    error.value = e1 || e2 ? 'Could not load preseason matches.' : null
    loading.value = false
  }

  async function act(p: PromiseLike<{ error: { code?: string; message: string } | null }>, fallback: string) {
    busy.value = true
    const r = await call(p, fallback)
    busy.value = false
    if (r.ok) await load()
    return r
  }

  const setInterest = (yes: boolean) =>
    act(supabase.rpc('preseason_set_interest', { p_team_id: toValue(teamId) ?? '', p_interested: yes }), 'Could not save your answer.')
  const propose = (pairingId: string, at: Date) =>
    act(supabase.rpc('preseason_propose', { p_pairing_id: pairingId, p_at: at.toISOString() }), 'Could not propose that time.')
  const respond = (proposalId: string, accept: boolean) =>
    act(supabase.rpc('preseason_respond', { p_proposal_id: proposalId, p_accept: accept }), 'Could not answer.')
  const cancelProposal = (proposalId: string) =>
    act(supabase.rpc('preseason_cancel_proposal', { p_proposal_id: proposalId }), 'Could not cancel it.')

  watch([() => toValue(teamId), () => toValue(seasonId)], load, { immediate: true })
  return { season, invited, interested, pairings, otherMatches, loading, busy, error, reload: load, setInterest, propose, respond, cancelProposal }
}

export interface InterestRow {
  team: PreseasonTeam
  invited: boolean
  interested: boolean | null
  respondedAt: string | null
}

/** Admin → Preseason: invites, answers, pairings. */
export function usePreseasonAdmin() {
  const season = ref<PreseasonSeason | null>(null)
  const teams = ref<InterestRow[]>([])
  const pairings = ref<PreseasonPairing[]>([])
  const loading = ref(true)
  const busy = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    const { data: active } = await supabase.from('seasons').select('id').in('status', ['signups', 'regular', 'playoffs']).maybeSingle()
    if (!active) {
      season.value = null
      loading.value = false
      return
    }
    const [seasonRow, { data: approved, error: e1 }, { data: interest, error: e2 }, { data: rows, error: e3 }] = await Promise.all([
      loadSeason(active.id),
      supabase.from('teams').select('id, name, tag, logo_url').eq('season_id', active.id).eq('status', 'approved').order('name'),
      supabase.from('preseason_interest').select('team_id, interested, responded_at').eq('season_id', active.id),
      supabase.from('preseason_pairings').select(PAIRING_SELECT).eq('season_id', active.id).order('created_at'),
    ])
    season.value = seasonRow
    teams.value = (approved ?? []).map((t) => {
      const i = (interest ?? []).find((x) => x.team_id === t.id)
      return { team: team(t), invited: Boolean(i), interested: i?.interested ?? null, respondedAt: i?.responded_at ?? null }
    })
    pairings.value = ((rows ?? []) as unknown as PairingRow[]).map(toPairing)
    error.value = e1 || e2 || e3 ? 'Could not load the preseason.' : null
    loading.value = false
  }

  async function act(p: PromiseLike<{ error: { code?: string; message: string } | null }>, fallback: string) {
    busy.value = true
    const r = await call(p, fallback)
    busy.value = false
    if (r.ok) await load()
    return r
  }

  const sendInvites = () => act(supabase.rpc('preseason_send_invites', { p_season_id: season.value?.id ?? '' }), 'Could not send the invites.')
  const generate = (replace: boolean) =>
    act(supabase.rpc('preseason_generate', { p_season_id: season.value?.id ?? '', p_replace: replace }), 'Could not make the schedule.')
  const cancelPairing = (id: string) => act(supabase.rpc('preseason_cancel_pairing', { p_pairing_id: id }), 'Could not cancel it.')

  void load()
  return { season, teams, pairings, loading, busy, error, reload: load, sendInvites, generate, cancelPairing }
}

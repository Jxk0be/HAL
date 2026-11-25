/**
 * Preseason: the invite buttons ("preseason:in|out:<teamId>"), the Accept/Decline buttons on a
 * proposed time ("preseason:accept|decline:<proposalId>"), and
 * /preseason match:<autocomplete> day:<autocomplete> time:<choice>.
 * All rules live in the preseason_*_as database functions, the same ones the site uses.
 */
import { ephemeral, type Handler } from '../_shared/interactions.ts'
import { noticeEmbed } from '../_shared/embeds.ts'
import { adminClient } from '../_shared/supabase.ts'
import { buildInvite, loadProposal, postProposal } from '../_shared/preseason_flow.ts'
import { proposalMessage } from '../_shared/preseason_messages.ts'
import { formatLeague, LEAGUE_TZ, upcomingDays, zonedToUtc } from '../_shared/time.ts'

const readable = (error: { code?: string; message: string }, fallback: string) =>
  error.code === 'P0001' || error.code === '42501' || error.code === 'P0002' ? error.message : fallback

// deno-lint-ignore no-explicit-any
const option = (options: any[] | undefined, name: string): string | undefined => options?.find((o) => o.name === name)?.value

interface OpenPairing {
  id: string
  opponent: { tag: string; name: string }
  scheduledAt: string | null
}

/** The actor's preseason matches that can still get a time (not cancelled, not started). */
async function openPairings(profileId: string): Promise<OpenPairing[]> {
  const db = adminClient()
  const { data: teams } = await db.from('teams').select('id').or(`captain_id.eq.${profileId},co_captain_id.eq.${profileId}`).neq('status', 'removed')
  const ids = (teams ?? []).map((t) => t.id as string)
  if (!ids.length) return []
  const list = ids.join(',')
  const { data } = await db
    .from('preseason_pairings')
    .select('id, status, home_team_id, home:teams!preseason_pairings_home_team_id_fkey(tag, name), away:teams!preseason_pairings_away_team_id_fkey(tag, name), match:matches(status, scheduled_at)')
    .or(`home_team_id.in.(${list}),away_team_id.in.(${list})`)
    .neq('status', 'cancelled')
  // deno-lint-ignore no-explicit-any
  return ((data ?? []) as any[])
    .filter((p) => !p.match || p.match.status === 'scheduled')
    .map((p) => ({
      id: p.id,
      opponent: ids.includes(p.home_team_id) ? p.away : p.home,
      scheduledAt: p.match?.scheduled_at ?? null,
    }))
}

export const preseasonAutocomplete: Handler = {
  async run({ interaction, profile }) {
    if (!profile) return { kind: 'autocomplete', choices: [] }
    const options = interaction.data?.options
    const focused = options?.find((o) => o.focused)
    if (focused?.name === 'day') {
      return { kind: 'autocomplete', choices: upcomingDays(new Date(), 21).map((d) => ({ name: d.label, value: d.date })) }
    }
    const q = String(focused?.value ?? '').toLowerCase()
    const pairings = await openPairings(profile.id)
    return {
      kind: 'autocomplete',
      choices: pairings
        .map((p) => ({
          name: `vs ${p.opponent.tag} (${p.opponent.name})${p.scheduledAt ? ` · now ${formatLeague(p.scheduledAt)}` : ' · no time yet'}`.slice(0, 100),
          value: p.id,
        }))
        .filter((c) => !q || c.name.toLowerCase().includes(q)),
    }
  },
}

export const preseasonCommand: Handler = {
  run({ interaction, profile, deps }) {
    const options = interaction.data?.options
    const pairingId = option(options, 'match') ?? ''
    const day = option(options, 'day') ?? ''
    const time = option(options, 'time') ?? ''
    return {
      kind: 'deferred',
      ephemeral: true,
      async work() {
        if (!profile) return { embeds: [noticeEmbed('Link your account on the site first.', 'error')] }
        if (!/^[0-9a-f-]{36}$/.test(pairingId) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) {
          return { embeds: [noticeEmbed('Pick the match, then a day and time from the lists.', 'error')] }
        }
        const db = adminClient()
        const proposed = zonedToUtc(day, time, LEAGUE_TZ)
        const { data: proposalId, error } = await db.rpc('preseason_propose_as', {
          p_actor: profile.id,
          p_pairing_id: pairingId,
          p_at: proposed.toISOString(),
        })
        if (error) return { embeds: [noticeEmbed(readable(error, 'Could not propose that time.'), 'error')] }
        try {
          await postProposal(db, String(proposalId), deps.siteUrl)
        } catch (err) {
          console.error('post preseason proposal failed', err)
        }
        return {
          embeds: [
            noticeEmbed(
              `Proposed **${formatLeague(proposed.toISOString())}**. The other team's captain or co-captain can accept it in your shared preseason channel or on the site.`,
              'success',
            ),
          ],
        }
      },
    }
  },
}

export const preseasonButton: Handler = {
  async run({ profile, deps, action, id }) {
    if (!profile || !id) return ephemeral('Unknown action.', 'error')
    const db = adminClient()

    if (action === 'in' || action === 'out') {
      const { error } = await db.rpc('preseason_set_interest_as', { p_actor: profile.id, p_team_id: id, p_interested: action === 'in' })
      if (error) return ephemeral(readable(error, 'Could not save your answer.'), 'error')
      const inv = await buildInvite(db, id, deps.siteUrl)
      return inv ? { kind: 'update', payload: inv.payload } : ephemeral('Saved.', 'success')
    }

    if (action === 'accept' || action === 'decline') {
      const { error } = await db.rpc('preseason_respond_as', { p_actor: profile.id, p_proposal_id: id, p_accept: action === 'accept' })
      if (error) return ephemeral(readable(error, 'Could not answer.'), 'error')
      // Redraw this post now; the scheduler announces the outcome (finishProposal runs once per answer,
      // from the outbox, so the announcement can't double up).
      const p = await loadProposal(db, id)
      if (!p) return ephemeral('Answered.', 'success')
      return { kind: 'update', payload: proposalMessage(p.view, deps.siteUrl) }
    }

    return ephemeral('Unknown action.', 'error')
  },
}

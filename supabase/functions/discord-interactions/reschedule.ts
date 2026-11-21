/**
 * /reschedule match:<autocomplete> day:<autocomplete> time:<choice>, and the Accept/Decline
 * buttons (custom_id "reschedule:accept|decline:<requestId>"). All rules live in
 * request_reschedule_as / respond_reschedule_as, the same functions the site uses.
 */
import { ephemeral, type Handler } from '../_shared/interactions.ts'
import { noticeEmbed } from '../_shared/embeds.ts'
import { adminClient } from '../_shared/supabase.ts'
import { loadMatch } from '../_shared/match_data.ts'
import { rescheduleOutcomeMessage } from '../_shared/match_messages.ts'
import { finishRescheduleRequest, loadRequest, postRescheduleRequest } from '../_shared/reschedule_flow.ts'
import { formatLeague, LEAGUE_TZ, remainingWeekDays, zonedToUtc } from '../_shared/time.ts'

interface Reschedulable {
  match_id: string
  week: number
  default_at: string
  scheduled_at: string
  timezone: string | null
  opponent_tag: string
  opponent_name: string
}

const readable = (error: { code?: string; message: string }, fallback: string) =>
  error.code === 'P0001' || error.code === '42501' || error.code === 'P0002' ? error.message : fallback

// deno-lint-ignore no-explicit-any
const option = (options: any[] | undefined, name: string): string | undefined => options?.find((o) => o.name === name)?.value

async function reschedulable(profileId: string): Promise<Reschedulable[]> {
  const { data } = await adminClient().rpc('reschedulable_matches_for', { p_actor: profileId })
  return (data ?? []) as Reschedulable[]
}

export const rescheduleAutocomplete: Handler = {
  async run({ interaction, profile }) {
    if (!profile) return { kind: 'autocomplete', choices: [] }
    const options = interaction.data?.options
    const focused = options?.find((o) => o.focused)
    const matches = await reschedulable(profile.id)

    if (focused?.name === 'day') {
      const m = matches.find((x) => x.match_id === option(options, 'match'))
      if (!m) return { kind: 'autocomplete', choices: [] }
      return {
        kind: 'autocomplete',
        choices: remainingWeekDays(m.default_at, new Date(), m.timezone ?? LEAGUE_TZ).map((d) => ({ name: d.label, value: d.date })),
      }
    }

    const q = String(focused?.value ?? '').toLowerCase()
    return {
      kind: 'autocomplete',
      choices: matches
        .map((m) => ({ name: `Week ${m.week} vs ${m.opponent_tag} · ${formatLeague(m.scheduled_at, m.timezone ?? LEAGUE_TZ)}`.slice(0, 100), value: m.match_id }))
        .filter((c) => !q || c.name.toLowerCase().includes(q)),
    }
  },
}

export const rescheduleCommand: Handler = {
  run({ interaction, profile, deps }) {
    const options = interaction.data?.options
    const matchId = option(options, 'match') ?? ''
    const day = option(options, 'day') ?? ''
    const time = option(options, 'time') ?? ''
    return {
      kind: 'deferred',
      ephemeral: true,
      async work() {
        if (!profile) return { embeds: [noticeEmbed('Link your account on the site first.', 'error')] }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) {
          return { embeds: [noticeEmbed('Pick the match, then a day and time from the lists.', 'error')] }
        }
        const db = adminClient()
        const { data: m } = await db.from('matches').select('id, season:seasons(timezone)').eq('id', matchId).maybeSingle()
        if (!m) return { embeds: [noticeEmbed('Pick one of your matches from the list.', 'error')] }
        // deno-lint-ignore no-explicit-any
        const tz = (m as any).season?.timezone ?? LEAGUE_TZ
        const proposed = zonedToUtc(day, time, tz)
        const { data: requestId, error } = await db.rpc('request_reschedule_as', {
          p_actor: profile.id,
          p_match_id: matchId,
          p_proposed_at: proposed.toISOString(),
        })
        if (error) return { embeds: [noticeEmbed(readable(error, 'Could not send the request.'), 'error')] }
        try {
          await postRescheduleRequest(db, String(requestId), deps.siteUrl)
        } catch (err) {
          console.error('post reschedule request failed', err)
        }
        return {
          embeds: [
            noticeEmbed(
              `Request sent: **${formatLeague(proposed.toISOString(), tz)}**. The other captain can accept or decline in their team channel or on the site. Unanswered requests expire 24 hours before the default time.`,
              'success',
            ),
          ],
        }
      },
    }
  },
}

export const rescheduleButton: Handler = {
  async run({ profile, deps, action, id }) {
    if (!profile || !id || (action !== 'accept' && action !== 'decline')) return ephemeral('Unknown action.', 'error')
    const db = adminClient()
    const { error } = await db.rpc('respond_reschedule_as', { p_actor: profile.id, p_request_id: id, p_accept: action === 'accept' })
    if (error) return ephemeral(readable(error, 'Could not answer the request.'), 'error')

    // Show the outcome on this message right away; the scheduler posts the result in both
    // channels (finishRescheduleRequest is idempotent, so the button and the outbox can't double-post).
    const r = await loadRequest(db, id)
    const m = r ? await loadMatch(db, r.matchId) : null
    if (!r || !m) return ephemeral('Answered.', 'success')
    const outcome = rescheduleOutcomeMessage(m, r, r.responder, deps.siteUrl)
    finishRescheduleRequest(db, id, deps.siteUrl).catch((err) => console.error('finish reschedule failed', err))
    return { kind: 'update', payload: outcome }
  },
}

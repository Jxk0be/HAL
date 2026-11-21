/**
 * Accept / Decline on the emergency sub DM ("esub:accept:<requestId>" / "esub:decline:<requestId>").
 * respond_emergency_sub_as applies the same rules as the site (only that player, request still
 * open, match not over); the outbox then tells #admin-only or the team's channel.
 */
import { ephemeral, type Handler } from '../_shared/interactions.ts'
import { adminClient } from '../_shared/supabase.ts'
import { loadEsub } from '../_shared/esub_flow.ts'
import { esubAnsweredDm } from '../_shared/esub_messages.ts'

const readable = (error: { code?: string; message: string }) =>
  error.code === 'P0001' || error.code === '42501' || error.code === 'P0002' ? error.message : 'Something went wrong. Try again on the site.'

export const esubButton: Handler = {
  async run({ profile, deps, action, id }) {
    if (!profile) return ephemeral('Link your account on the site first.', 'error')
    if (action !== 'accept' && action !== 'decline') return ephemeral('Unknown button.', 'error')
    const db = adminClient()
    const accept = action === 'accept'
    const { error } = await db.rpc('respond_emergency_sub_as', { p_actor: profile.id, p_request_id: id ?? '', p_accept: accept })
    if (error) return ephemeral(readable(error), 'error')
    const r = await loadEsub(db, id ?? '')
    if (!r) return ephemeral(accept ? 'Accepted.' : 'Declined.', 'success')
    return { kind: 'update', payload: esubAnsweredDm(r, accept, deps.siteUrl) }
  },
}

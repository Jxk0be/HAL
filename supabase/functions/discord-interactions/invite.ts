/**
 * Accept / Decline on a team invite DM ("invite:accept:<inviteId>" / "invite:decline:<inviteId>").
 * respond_to_invite_as runs the site's respond_to_invite as the player, so every roster rule is
 * the same. The outbox then updates the DM and tells the team's channel.
 */
import { ephemeral, type Handler } from '../_shared/interactions.ts'
import { adminClient } from '../_shared/supabase.ts'
import { loadInvite } from '../_shared/invite_flow.ts'
import { inviteClosedDm, type InviteStatus } from '../_shared/invite_messages.ts'

const readable = (error: { code?: string; message: string }) =>
  error.code === 'P0001' || error.code === '42501' || error.code === 'P0002' ? error.message : 'Something went wrong. Try again on your profile page.'

export const inviteButton: Handler = {
  async run({ profile, deps, action, id }) {
    if (!profile) return ephemeral('Link your account on the site first.', 'error')
    if (action !== 'accept' && action !== 'decline') return ephemeral('Unknown button.', 'error')
    const db = adminClient()
    const { data: status, error } = await db.rpc('respond_to_invite_as', {
      p_actor: profile.id,
      p_invite_id: id ?? '',
      p_accept: action === 'accept',
    })
    if (error) return ephemeral(readable(error), 'error')
    const inv = await loadInvite(db, id ?? '')
    if (!inv) return ephemeral('Done.', 'success')
    return { kind: 'update', payload: inviteClosedDm(inv, (status as InviteStatus) ?? inv.status, deps.siteUrl) }
  },
}

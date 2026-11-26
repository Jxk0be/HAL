/**
 * #teams-recruiting card button "recruit:interest:<postId>" (I'm interested). recruit_interest_as
 * checks the player can join (complete profile, not banned, no team this season) and records it
 * once; the scheduler then tells the team channel (recruit_interest outbox event).
 */
import { ephemeral, type Handler } from '../_shared/interactions.ts'
import { adminClient } from '../_shared/supabase.ts'

export const recruitButton: Handler = {
  async run({ profile, deps, action, id }) {
    if (!profile) return ephemeral(`Link your account first: [log in with Discord](${deps.siteUrl}/login).`, 'error')
    if (action !== 'interest' || !id) return ephemeral('Unknown button.', 'error')
    const { data, error } = await adminClient().rpc('recruit_interest_as', { p_actor: profile.id, p_post_id: id })
    if (error) {
      return ephemeral(error.code === 'P0001' ? error.message : 'Something went wrong. Try again in a minute.', 'error')
    }
    if (data === 'already') return ephemeral("You've already told this team you're interested. The captains will invite you if it's a fit.")
    return ephemeral(
      `Sent. The captains get a ping in their team channel within a few minutes. If they want you, the invite shows up on [your profile](${deps.siteUrl}/profile) and in your DMs.`,
      'success',
    )
  },
}

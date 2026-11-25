/**
 * #sub-board buttons: "subs:yes:<matchId>:<teamId>" (I'm available) and "subs:no:..." (withdraw).
 * volunteer_for_sub_as checks the player can sub (not on a team this season, profile complete) and
 * that the team still needs someone. The post is redrawn straight away, and on a new volunteer the
 * team's channel tells the captains.
 */
import { ephemeral, type Handler } from '../_shared/interactions.ts'
import { adminClient } from '../_shared/supabase.ts'
import { sendMessage } from '../_shared/discord.ts'
import { subBoard, volunteerNotice } from '../_shared/boards.ts'
import { loadSubNeeds } from '../_shared/board_sync.ts'

const readable = (error: { code?: string; message: string }) =>
  error.code === 'P0001' ? error.message : 'Something went wrong. Try again in a minute.'

export const subsButton: Handler = {
  async run({ profile, deps, action, id }) {
    if (!profile) return ephemeral('Link your account on the site first.', 'error')
    if (action !== 'yes' && action !== 'no') return ephemeral('Unknown button.', 'error')
    const [matchId = '', teamId = ''] = (id ?? '').split(':')
    const db = adminClient()

    const { data: outcome, error } = await db.rpc('volunteer_for_sub_as', {
      p_actor: profile.id,
      p_match_id: matchId,
      p_team_id: teamId,
      p_available: action === 'yes',
    })
    if (error) return ephemeral(readable(error), 'error')

    const need = (await loadSubNeeds(db)).find((n) => n.matchId === matchId && n.teamId === teamId)

    if (outcome === 'added' && need) {
      try {
        const { data: team } = await db
          .from('teams')
          .select('discord_channel_id, captain:profiles!teams_captain_id_fkey(discord_id), co:profiles!teams_co_captain_id_fkey(discord_id)')
          .eq('id', teamId)
          .maybeSingle()
        // deno-lint-ignore no-explicit-any
        const t = team as any
        if (t?.discord_channel_id) {
          const captains = [t.captain?.discord_id, t.co?.discord_id].filter((x: unknown): x is string => typeof x === 'string')
          const name = profile.activisionId ?? profile.discordUsername ?? 'A free agent'
          await sendMessage(t.discord_channel_id, volunteerNotice({ teamId, matchId, opponentName: need.opponentName }, name, captains, deps.siteUrl))
        }
      } catch (err) {
        console.error('sub volunteer notice failed', err)
      }
    }

    // Redraw the post. If the team no longer needs anyone, the scheduler removes it on its next run.
    if (need) return { kind: 'update', payload: subBoard(need, deps.siteUrl) }
    return ephemeral(action === 'yes' ? "You're on the list." : "You're off the list.", 'success')
  },
}

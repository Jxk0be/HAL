/**
 * /help: a private reply explaining the channel it was used in and the commands that work there,
 * with a note for unlinked users and for captains in their own team channel.
 */
import type { Handler } from '../_shared/interactions.ts'
import { adminClient } from '../_shared/supabase.ts'
import { loadChannels } from '../_shared/match_data.ts'
import { helpEmbeds, type ChannelKind } from '../_shared/help.ts'

export const helpCommand: Handler = {
  public: true,
  async run({ interaction, user, deps }) {
    const channelId = interaction.channel_id ?? ''
    const db = adminClient()
    // Public handlers don't get the profile from the router, so look it up here.
    const [profile, channels] = await Promise.all([deps.getProfileByDiscordId(user.id), loadChannels(db)])

    let kind: ChannelKind = 'other'
    let captain = false
    let teamName: string | null = null
    const fixed = (Object.entries(channels) as [Exclude<ChannelKind, 'team' | 'other'>, string | null][]).find(
      ([, id]) => id && id === channelId,
    )
    if (fixed) {
      kind = fixed[0]
    } else if (channelId) {
      const { data: team } = await db
        .from('teams')
        .select('name, captain_id, co_captain_id')
        .eq('discord_channel_id', channelId)
        .maybeSingle()
      if (team) {
        kind = 'team'
        teamName = team.name
        captain = Boolean(profile && [team.captain_id, team.co_captain_id].includes(profile.id))
      }
    }

    return {
      kind: 'message',
      ephemeral: true,
      payload: { embeds: helpEmbeds(kind, { linked: Boolean(profile), captain, teamName }, deps.siteUrl) },
    }
  },
}

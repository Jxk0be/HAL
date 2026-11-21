/**
 * /lfg post | remove, the post modal ("lfg:post") and the "Invite to team" button
 * ("lfg:invite:<userId>"). The database functions (lfg_upsert_as, lfg_remove_as,
 * invite_player_as) apply the same rules as the site.
 */
import { ephemeral, type Handler } from '../_shared/interactions.ts'
import { noticeEmbed } from '../_shared/embeds.ts'
import { CANNOT_DM, createDmChannel, discordErrorCode, sendMessage } from '../_shared/discord.ts'
import { adminClient } from '../_shared/supabase.ts'
import { loadChannels } from '../_shared/match_data.ts'
import { inviteDm, lfgModal, modalValues } from '../_shared/lfg_messages.ts'
import { deleteLfgMessage, publishLfg } from '../_shared/lfg_sync.ts'

const readable = (error: { code?: string; message: string }, fallback: string) =>
  error.code === 'P0001' || error.code === '42501' || error.code === 'P0002' ? error.message : fallback

export const lfgCommand: Handler = {
  async run({ interaction, profile, deps }) {
    if (!profile) return ephemeral('Link your account on the site first.', 'error')
    const db = adminClient()
    const sub = interaction.data?.options?.[0]?.name

    if (sub === 'remove') {
      return {
        kind: 'deferred',
        ephemeral: true,
        async work() {
          const { data, error } = await db.rpc('lfg_remove_as', { p_user_id: profile.id })
          if (error) return { embeds: [noticeEmbed(readable(error, 'Could not remove your post.'), 'error')] }
          const r = data as { removed: boolean; channel_id?: string; message_id?: string }
          if (!r.removed) return { embeds: [noticeEmbed('You don’t have an active free agent post.')] }
          await deleteLfgMessage(r.channel_id, r.message_id).catch((err) => console.error('delete lfg message failed', err))
          return { embeds: [noticeEmbed('Your free agent post is down, here and on the site.', 'success')] }
        },
      }
    }

    // post: check the basics before showing the form, then prefill it from the current post.
    const [{ data: complete }, { data: onTeam }, { data: current }] = await Promise.all([
      db.rpc('is_profile_complete', { p_user_id: profile.id }),
      db.from('team_members').select('id').eq('user_id', profile.id).is('left_at', null).eq('is_emergency', false).limit(1),
      db.from('free_agent_posts').select('preferred_role, availability, note').eq('user_id', profile.id).eq('active', true).maybeSingle(),
    ])
    if (complete !== true) {
      return ephemeral(`Finish your profile first (Activision ID, platform and age): [set it up on the site](${deps.siteUrl}/onboarding).`, 'error')
    }
    if (onTeam?.length) {
      return ephemeral(`You’re on a team, so you can’t post as a free agent. [My team](${deps.siteUrl}/my-team)`, 'error')
    }
    return {
      kind: 'modal',
      data: lfgModal(current ? { role: current.preferred_role, availability: current.availability, note: current.note } : null),
    }
  },
}

export const lfgModalHandler: Handler = {
  run({ interaction, profile, deps }) {
    const values = modalValues(interaction.data?.components)
    return {
      kind: 'deferred',
      ephemeral: true,
      async work() {
        if (!profile) return { embeds: [noticeEmbed('Link your account on the site first.', 'error')] }
        const db = adminClient()
        const { data, error } = await db.rpc('lfg_upsert_as', {
          p_user_id: profile.id,
          p_role: values.role ?? '',
          p_availability: values.availability ?? '',
          p_note: values.note ?? '',
        })
        if (error) return { embeds: [noticeEmbed(readable(error, 'Could not save your post.'), 'error')] }
        const post = data as { post_id: string }
        const channels = await loadChannels(db)
        try {
          const where = await publishLfg(db, post.post_id, channels.lfg, deps.siteUrl)
          const link = where && interaction.guild_id ? `https://discord.com/channels/${interaction.guild_id}/${where.channelId}/${where.messageId}` : null
          return {
            embeds: [
              noticeEmbed(
                `Your free agent post is up${link ? ` ([view it](${link}))` : ''} and on the [Free Agents page](${deps.siteUrl}/free-agents). Captains can invite you from either.`,
                'success',
              ),
            ],
          }
        } catch (err) {
          console.error('publish lfg failed', err)
          return { embeds: [noticeEmbed(`Saved on the site ([Free Agents](${deps.siteUrl}/free-agents)), but I couldn’t post it in Discord. An admin needs to set the #lfg-free-agents channel.`, 'error')] }
        }
      },
    }
  },
}

export const lfgButton: Handler = {
  run({ profile, deps, action, id }) {
    if (action !== 'invite' || !id) return ephemeral('Unknown action.', 'error')
    return {
      kind: 'deferred',
      ephemeral: true,
      newMessage: true,
      async work() {
        if (!profile) return { embeds: [noticeEmbed('Link your account on the site first.', 'error')] }
        const db = adminClient()
        const { data: teamId } = await db.rpc('captain_team_for', { p_user_id: profile.id })
        if (!teamId) return { embeds: [noticeEmbed('Only team captains and co-captains can invite players.', 'error')] }
        const { error } = await db.rpc('invite_player_as', { p_actor: profile.id, p_team_id: teamId, p_user_id: id })
        if (error) return { embeds: [noticeEmbed(readable(error, 'Could not send the invite.'), 'error')] }

        const [{ data: team }, { data: player }] = await Promise.all([
          db.from('teams').select('name').eq('id', teamId).single(),
          db.from('profiles').select('discord_id, discord_username, activision_id').eq('id', id).single(),
        ])
        const playerName = player?.discord_username ?? player?.activision_id ?? 'the player'
        const captain = profile.discordUsername ?? profile.activisionId ?? 'A captain'
        const manual = `${deps.siteUrl}/profile`
        if (player?.discord_id) {
          try {
            const dm = await createDmChannel(player.discord_id)
            await sendMessage(dm.id, inviteDm(captain, team?.name ?? 'A team', deps.siteUrl))
            return { embeds: [noticeEmbed(`Invite sent to **${playerName}**. I DM’d them the link; it’s also on their HAL profile.`, 'success')] }
          } catch (err) {
            if (discordErrorCode(err) !== CANNOT_DM) console.error('invite DM failed', err)
          }
        }
        return {
          embeds: [
            noticeEmbed(`Invite sent to **${playerName}** on the site, but I couldn’t DM them. Send them this link to accept: ${manual}`, 'success'),
          ],
        }
      },
    }
  },
}

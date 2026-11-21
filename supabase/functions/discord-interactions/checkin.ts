/**
 * Check-in buttons (custom_id "checkin:open:<matchId>" and the select "checkin:pick:<matchId>").
 * Only that team's captain or co-captain can use them; the database (check_in_as) re-checks
 * captaincy, the window and eligibility, the same rules as the site.
 */
import { ephemeral, type Handler } from '../_shared/interactions.ts'
import { noticeEmbed } from '../_shared/embeds.ts'
import { editMessage } from '../_shared/discord.ts'
import { adminClient } from '../_shared/supabase.ts'
import { findEvent, loadMatch } from '../_shared/match_data.ts'
import { checkedInMessage } from '../_shared/match_messages.ts'

const ONLY_CAPTAIN = 'Only your captain or co-captain can check in.'

export const checkinHandler: Handler = {
  async run({ interaction, user, profile, deps, action, id }) {
    const matchId = id ?? ''
    const db = adminClient()
    const m = await loadMatch(db, matchId)
    if (!m) return ephemeral('That match no longer exists.', 'error')
    const team = [m.home, m.away].find((t) => t.captainDiscordIds.includes(user.id))
    if (!team || !profile) return ephemeral(ONLY_CAPTAIN, 'error')

    if (action === 'open') {
      const start = new Date(m.scheduledAt).getTime()
      if (Date.now() < start - 15 * 60_000) return ephemeral('Check-in opens 15 minutes before the match.', 'error')
      if (!['scheduled', 'checkin_open'].includes(m.status)) return ephemeral('Check-in is closed for this match.', 'error')
      const { data, error } = await db.rpc('eligible_checkin_players', { p_match_id: matchId, p_team_id: team.id })
      if (error) throw error
      const players = (data ?? []) as { user_id: string; name: string; is_emergency: boolean }[]
      if (players.length < 4) {
        return ephemeral(
          `Only ${players.length} of your players are eligible (on the roster 24 hours before the match, or an approved emergency sub). Request an emergency sub on the match page: ${deps.siteUrl}/matches/${matchId}`,
          'error',
        )
      }
      return {
        kind: 'message',
        ephemeral: true,
        payload: {
          embeds: [noticeEmbed(`Pick the 4 players playing for **${team.name}**.`)],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 3,
                  custom_id: `checkin:pick:${matchId}`,
                  placeholder: 'Choose 4 players',
                  min_values: 4,
                  max_values: 4,
                  options: players.slice(0, 25).map((p) => ({
                    label: p.name.slice(0, 100),
                    value: p.user_id,
                    description: p.is_emergency ? 'Emergency sub for this match' : undefined,
                  })),
                },
              ],
            },
          ],
        },
      }
    }

    if (action === 'pick') {
      const values = interaction.data?.values ?? []
      return {
        kind: 'deferred',
        ephemeral: true,
        async work() {
          const { data, error } = await db.rpc('check_in_as', {
            p_user_id: profile.id,
            p_match_id: matchId,
            p_player_ids: values,
            p_source: 'discord',
          })
          if (error) {
            const readable = error.code === 'P0001' || error.code === '42501'
            return { embeds: [noticeEmbed(readable ? error.message : 'Check-in failed. Please try again or use the site.', 'error')], components: [] }
          }
          const result = data as { team_id: string; players: string[]; checked_in_at: string }
          // Turn the channel's check-in post into the confirmation.
          const ev = await findEvent(db, matchId, team.id, 'checkin')
          if (ev?.discord_channel_id && ev.discord_message_id) {
            await editMessage(ev.discord_channel_id, ev.discord_message_id, checkedInMessage(m, team.id, result.players, result.checked_in_at, deps.siteUrl)).catch((err) =>
              console.error('edit check-in post failed', err),
            )
          }
          return { embeds: [noticeEmbed(`Checked in: ${result.players.map((p) => `**${p}**`).join(', ')}`, 'success')], components: [] }
        },
      }
    }

    return ephemeral('Unknown check-in action.', 'error')
  },
}

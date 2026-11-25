/**
 * 8s buttons (see _shared/eights.ts for the custom_ids) and /8s join | leave | leaderboard.
 * Public, so the leaderboard works for anyone; everything else looks the player up itself.
 * The rules (who may queue, report, settle) are in the eights_* database functions.
 */
import { ephemeral, notLinkedReply, type Context, type Handler, type Reply } from '../_shared/interactions.ts'
import { noticeEmbed } from '../_shared/embeds.ts'
import { adminClient } from '../_shared/supabase.ts'
import { loadChannels } from '../_shared/match_data.ts'
import { leaderboardEmbed, resolvedAlert, teamLabel, QUEUE_SIZE, REPORTS_PER_TEAM, type Team } from '../_shared/eights.ts'
import { alertAdmins, loadEightsMatch, loadLeaderboard, refreshMatchPost, refreshQueueBoard, startMatch } from '../_shared/eights_flow.ts'

const readable = (error: { code?: string; message: string }, fallback: string) => (error.code === 'P0001' ? error.message : fallback)
const notice = (text: string, tone: 'info' | 'success' | 'error' = 'info') => ({ embeds: [noticeEmbed(text, tone)] })

/** Private replies to buttons go in a new message so the post the button sits on isn't replaced. */
const privately = (work: () => Promise<ReturnType<typeof notice>>): Reply => ({ kind: 'deferred', ephemeral: true, newMessage: true, work })

function join(userId: string): Reply {
  return privately(async () => {
    const db = adminClient()
    const { data, error } = await db.rpc('eights_join', { p_user_id: userId })
    if (error) return notice(readable(error, 'Could not join the queue. Try again in a minute.'), 'error')
    const r = data as { status: 'queued' | 'already' | 'started'; count: number; match_id?: string }
    const channels = await loadChannels(db)
    await refreshQueueBoard(db, channels).catch((err) => console.error('8s queue board failed', err))

    if (r.status === 'started' && r.match_id) {
      const started = await startMatch(db, r.match_id, channels)
      const mine = started?.match.teamA.some((p) => p.userId === userId) ? 'a' : 'b'
      return notice(`The queue filled: 8s match #${started?.match.number ?? ''} is on and you're on **${teamLabel(mine)}**. Vote for the mode on the match post: you have 2 minutes.`, 'success')
    }
    const spot = `${r.count}/${QUEUE_SIZE}`
    return notice(
      r.status === 'already'
        ? `You're already in the queue (${spot}).`
        : `You're in the queue (${spot}). Hop in **🔊 8s Waiting Room** so I can move you to your team when it fills.`,
      'success',
    )
  })
}

function leave(userId: string): Reply {
  return privately(async () => {
    const db = adminClient()
    const { data, error } = await db.rpc('eights_leave', { p_user_id: userId })
    if (error) return notice('Could not leave the queue. Try again in a minute.', 'error')
    await refreshQueueBoard(db, await loadChannels(db)).catch((err) => console.error('8s queue board failed', err))
    return notice(data ? "You're out of the queue." : "You weren't in the queue.")
  })
}

function report(userId: string, matchId: string, winner: Team): Reply {
  return privately(async () => {
    const db = adminClient()
    const { data, error } = await db.rpc('eights_report', { p_user_id: userId, p_match_id: matchId, p_winner: winner })
    if (error) return notice(readable(error, 'Could not save your report. Try again in a minute.'), 'error')
    const r = data as { status: 'saved' | 'confirmed' | 'disputed' }
    const m = await refreshMatchPost(db, matchId).catch((err) => {
      console.error('8s match post failed', err)
      return null
    })
    if (r.status === 'confirmed') return notice(`Confirmed: **${teamLabel(winner)} won**. It's on the leaderboard.`, 'success')
    if (r.status === 'disputed') {
      const told = m ? await alertAdmins(db, m, await loadChannels(db)).catch(() => false) : false
      return notice(`The reports don't match, so ${told ? 'the admins have been pinged and will decide' : 'an admin will decide'}.`, 'error')
    }
    return notice(`Saved: you said **${teamLabel(winner)} won**. Waiting for ${REPORTS_PER_TEAM} players from each team. Pressed the wrong one? Press the other button.`, 'success')
  })
}

function vote(userId: string, matchId: string, modeId: string): Reply {
  return privately(async () => {
    const db = adminClient()
    const { data, error } = await db.rpc('eights_vote', { p_user_id: userId, p_match_id: matchId, p_mode_id: modeId })
    if (error) return notice(readable(error, 'Could not save your vote. Try again in a minute.'), 'error')
    const r = data as { status: 'voted' | 'closed' }
    const m = await refreshMatchPost(db, matchId).catch((err) => {
      console.error('8s match post failed', err)
      return null
    })
    if (r.status === 'closed' && m) {
      return notice(`All 8 voted: **${m.modeName ?? 'your call'}** on **${m.mapName ?? 'your call'}**. GLHF!`, 'success')
    }
    const picked = m?.vote?.options.find((o) => o.modeId === modeId)?.name
    return notice(`Voted${picked ? ` **${picked}**` : ''}. You can change it until voting closes.`, 'success')
  })
}

function requestCancel(userId: string, matchId: string): Reply {
  return privately(async () => {
    const db = adminClient()
    const { data, error } = await db.rpc('eights_request_cancel', { p_user_id: userId, p_match_id: matchId })
    if (error) return notice(readable(error, 'Could not save that. Try again in a minute.'), 'error')
    const r = data as { status: 'requested' | 'withdrawn' | 'cancelled'; count: number; needed: number }
    await refreshMatchPost(db, matchId).catch((err) => console.error('8s match post failed', err))
    switch (r.status) {
      case 'cancelled':
        return notice(`Cancelled: ${r.needed} players asked. It doesn't count for anything. Press **Queue again** to play another.`, 'success')
      case 'withdrawn':
        return notice(`You took back your cancel request (${r.count}/${r.needed}).`)
      default:
        return notice(`Cancel requested (${r.count}/${r.needed}). It cancels at ${r.needed}. Press again to take it back.`, 'success')
    }
  })
}

async function settle(ctx: Context, profileId: string, matchId: string, choice: string): Promise<Reply> {
  const db = adminClient()
  const { data: isAdmin } = await db.rpc('is_admin_for', { p_user_id: profileId })
  if (isAdmin !== true) return ephemeral('Only admins can settle 8s matches.', 'error')
  const winner = choice === 'a' || choice === 'b' ? choice : null
  // Edits the alert itself: the buttons go away once it's settled.
  return {
    kind: 'deferred',
    async work() {
      const { error } = await db.rpc('eights_resolve', { p_actor: profileId, p_match_id: matchId, p_winner: winner })
      if (error) throw new Error(error.message)
      await refreshMatchPost(db, matchId).catch((err) => console.error('8s match post failed', err))
      const m = await loadEightsMatch(db, matchId)
      const admin = ctx.user.global_name ?? ctx.user.username
      return m ? resolvedAlert(m, admin) : notice('Settled.', 'success')
    },
  }
}

const board = (visible: boolean): Reply => ({
  kind: 'deferred',
  ephemeral: !visible,
  newMessage: true,
  work: async () => leaderboardEmbed(await loadLeaderboard(adminClient())),
})

export const eightsButton: Handler = {
  public: true,
  async run(ctx) {
    const { action, id, user, deps } = ctx
    if (action === 'board') return board(false)
    const profile = await deps.getProfileByDiscordId(user.id)
    if (!profile) return notLinkedReply(deps.siteUrl)
    const [matchId = '', choice = ''] = (id ?? '').split(':')
    switch (action) {
      case 'join':
        return join(profile.id)
      case 'leave':
        return leave(profile.id)
      case 'vote':
        return choice ? vote(profile.id, matchId, choice) : ephemeral('Unknown button.', 'error')
      case 'cancel':
        return requestCancel(profile.id, matchId)
      case 'won':
        return choice === 'a' || choice === 'b' ? report(profile.id, matchId, choice) : ephemeral('Unknown button.', 'error')
      case 'fix':
        return settle(ctx, profile.id, matchId, choice)
      default:
        return ephemeral('Unknown button.', 'error')
    }
  },
}

export const eightsCommand: Handler = {
  public: true,
  async run({ interaction, user, deps }) {
    const sub = interaction.data?.options?.[0]?.name
    if (sub === 'leaderboard') return board(true)
    const profile = await deps.getProfileByDiscordId(user.id)
    if (!profile) return notLinkedReply(deps.siteUrl)
    return sub === 'leave' ? leave(profile.id) : join(profile.id)
  },
}

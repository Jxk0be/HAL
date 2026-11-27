/**
 * Keeps #teams-recruiting in step with team_recruit_posts, and tells a team channel when a player
 * is interested. Called by discord-scheduler for the outbox events recruit_changed,
 * recruit_deleted and recruit_interest (queued by the recruit_* database functions).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { discordErrorCode, editMessage, sendMessage, UNKNOWN_CHANNEL, UNKNOWN_MESSAGE } from './discord.ts'
import { deleteLfgMessage } from './lfg_sync.ts'
import { interestNotice, recruitPostMessage, type LookingFor, type RecruitPost } from './recruit_messages.ts'

interface StoredRecruitPost extends RecruitPost {
  active: boolean
  channelId: string | null
  messageId: string | null
}

async function loadRecruitPost(db: SupabaseClient, postId: string): Promise<StoredRecruitPost | null> {
  const { data, error } = await db
    .from('team_recruit_posts')
    .select('id, team_id, looking_for, roles, availability, note, active, discord_channel_id, discord_message_id, team:teams(name, tag, logo_url)')
    .eq('id', postId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  // deno-lint-ignore no-explicit-any
  const team = (data as any).team ?? {}
  const { data: spots } = await db.rpc('team_open_spots', { p_team_id: data.team_id })
  const s = (Array.isArray(spots) ? spots[0] : spots) as { open: number; starters_open: number; subs_open: number } | undefined
  return {
    id: data.id,
    teamId: data.team_id,
    teamName: team.name ?? 'A team',
    teamTag: team.tag ?? '',
    logoUrl: team.logo_url ?? null,
    lookingFor: data.looking_for as LookingFor,
    roles: (data.roles as string[] | null) ?? [],
    availability: data.availability,
    note: data.note,
    open: s?.open ?? 0,
    startersOpen: s?.starters_open ?? 0,
    subsOpen: s?.subs_open ?? 0,
    active: data.active,
    channelId: data.discord_channel_id,
    messageId: data.discord_message_id,
  }
}

async function setMessage(db: SupabaseClient, postId: string, channelId: string | null, messageId: string | null) {
  await db.from('team_recruit_posts').update({ discord_channel_id: channelId, discord_message_id: messageId }).eq('id', postId)
}

/** Deletes a #teams-recruiting card, ignoring "already gone". */
export const deleteRecruitMessage = deleteLfgMessage

/**
 * Makes Discord match the post: posts or edits the card while active, deletes it once inactive.
 * With no #teams-recruiting channel set, active posts stay site-only.
 */
export async function publishRecruit(db: SupabaseClient, postId: string, channelId: string | null, siteUrl: string): Promise<void> {
  const post = await loadRecruitPost(db, postId)
  if (!post) return
  if (!post.active) {
    await deleteRecruitMessage(post.channelId, post.messageId)
    if (post.messageId) await setMessage(db, post.id, null, null)
    return
  }
  const payload = recruitPostMessage(post, siteUrl)
  if (post.channelId && post.messageId) {
    try {
      await editMessage(post.channelId, post.messageId, payload)
      return
    } catch (err) {
      const code = discordErrorCode(err)
      if (code !== UNKNOWN_MESSAGE && code !== UNKNOWN_CHANNEL) throw err
      // Deleted by hand: post it again below.
    }
  }
  if (!channelId) return
  const msg = await sendMessage(channelId, payload)
  await setMessage(db, post.id, channelId, msg.id)
}

/** Tells the team channel (pinging the captains) that a player pressed "I'm interested". Once per player and post. */
export async function notifyInterest(db: SupabaseClient, postId: string, userId: string, siteUrl: string): Promise<void> {
  const { data: row } = await db
    .from('team_recruit_interest')
    .select('notified_at')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!row || row.notified_at) return

  const { data: post } = await db
    .from('team_recruit_posts')
    .select('team:teams(discord_channel_id, captain:profiles!teams_captain_id_fkey(discord_id), co:profiles!teams_co_captain_id_fkey(discord_id))')
    .eq('id', postId)
    .maybeSingle()
  // deno-lint-ignore no-explicit-any
  const team = (post as any)?.team
  const { data: player } = await db.from('profiles').select('id, discord_id, discord_username, activision_id, main_role').eq('id', userId).maybeSingle()
  if (team?.discord_channel_id && player) {
    const { data: fa } = await db.from('free_agent_posts').select('preferred_role').eq('user_id', userId).eq('active', true).maybeSingle()
    const captains = [team.captain?.discord_id, team.co?.discord_id].filter((x: unknown): x is string => typeof x === 'string')
    await sendMessage(
      team.discord_channel_id,
      interestNotice(
        { id: player.id, name: player.discord_username ?? player.activision_id ?? 'A player', discordId: player.discord_id, role: player.main_role ?? fa?.preferred_role ?? null },
        captains,
        siteUrl,
      ),
    )
  }
  await db.from('team_recruit_interest').update({ notified_at: new Date().toISOString() }).eq('post_id', postId).eq('user_id', userId)
}

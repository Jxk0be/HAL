/**
 * Keeps #lfg-free-agents in step with free_agent_posts. Used by /lfg (discord-interactions) and by
 * discord-scheduler when the site changes a post (lfg_changed / lfg_deleted outbox events).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { deleteMessage, discordErrorCode, editMessage, sendMessage, UNKNOWN_CHANNEL, UNKNOWN_MESSAGE } from './discord.ts'
import { lfgPostMessage, type LfgPost } from './lfg_messages.ts'

export interface StoredLfgPost extends LfgPost {
  id: string
  active: boolean
  channelId: string | null
  messageId: string | null
}

export async function loadLfgPost(db: SupabaseClient, postId: string): Promise<StoredLfgPost | null> {
  const { data, error } = await db
    .from('free_agent_posts')
    .select('id, user_id, active, platform, preferred_role, availability, note, discord_channel_id, discord_message_id, profile:profiles(discord_id, activision_id, discord_username)')
    .eq('id', postId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  // deno-lint-ignore no-explicit-any
  const profile = (data as any).profile ?? {}
  return {
    id: data.id,
    userId: data.user_id,
    active: data.active,
    platform: data.platform,
    role: data.preferred_role,
    availability: data.availability,
    note: data.note,
    channelId: data.discord_channel_id,
    messageId: data.discord_message_id,
    discordId: profile.discord_id ?? '',
    activisionId: profile.activision_id ?? null,
    discordUsername: profile.discord_username ?? null,
  }
}

/** Deletes a Discord message, ignoring "already gone". */
export async function deleteLfgMessage(channelId: string | null | undefined, messageId: string | null | undefined) {
  if (!channelId || !messageId) return
  try {
    await deleteMessage(channelId, messageId)
  } catch (err) {
    const code = discordErrorCode(err)
    if (code !== UNKNOWN_MESSAGE && code !== UNKNOWN_CHANNEL) throw err
  }
}

/**
 * Makes Discord match the post: edits the message (or posts it if it's missing) while active,
 * deletes it once inactive. Returns where the message is, or null if there is none.
 */
export async function publishLfg(
  db: SupabaseClient,
  postId: string,
  lfgChannelId: string | null,
  siteUrl: string,
): Promise<{ channelId: string; messageId: string } | null> {
  const post = await loadLfgPost(db, postId)
  if (!post) return null
  if (!post.active) {
    await deleteLfgMessage(post.channelId, post.messageId)
    if (post.messageId) await db.rpc('lfg_set_message', { p_post_id: post.id, p_channel_id: null, p_message_id: null })
    return null
  }
  const payload = lfgPostMessage(post, siteUrl)
  if (post.channelId && post.messageId) {
    try {
      await editMessage(post.channelId, post.messageId, payload)
      return { channelId: post.channelId, messageId: post.messageId }
    } catch (err) {
      const code = discordErrorCode(err)
      if (code !== UNKNOWN_MESSAGE && code !== UNKNOWN_CHANNEL) throw err
      // Deleted by hand: post it again below.
    }
  }
  if (!lfgChannelId) throw new Error('No #lfg-free-agents channel set (Admin → Discord)')
  const msg = await sendMessage(lfgChannelId, payload)
  await db.rpc('lfg_set_message', { p_post_id: post.id, p_channel_id: lfgChannelId, p_message_id: msg.id })
  return { channelId: lfgChannelId, messageId: msg.id }
}

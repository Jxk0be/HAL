/**
 * Pinned channel guides: one bot message per league channel saying what the channel is for and
 * which commands work there (content in _shared/help.ts). Posted once, then edited in place, so
 * running it again just refreshes the text. Message ids live in app_settings.discord_guides as
 * { channelId: messageId }.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { discordErrorCode, editMessage, pinMessage, sendMessage, UNKNOWN_CHANNEL, UNKNOWN_MESSAGE } from '../_shared/discord.ts'
import { loadChannels } from '../_shared/match_data.ts'
import { guideEmbed, type ChannelKind } from '../_shared/help.ts'

const KEY = 'discord_guides'

export interface GuideStats {
  posted: number
  updated: number
  /** Posted but the bot couldn't pin it (missing Pin Messages permission). */
  notPinned: number
  /** Channel ids that failed (deleted channel, no access). */
  failed: number
}

export const siteUrl = () => (Deno.env.get('SITE_URL') ?? 'http://localhost:5174').replace(/\/+$/, '')

async function loadIds(db: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle()
  return (data?.value ?? {}) as Record<string, string>
}

async function saveIds(db: SupabaseClient, ids: Record<string, string>) {
  await db.from('app_settings').upsert({ key: KEY, value: ids })
}

/** Posts or refreshes one channel's guide. Returns what happened. */
async function upsertGuide(
  ids: Record<string, string>,
  channelId: string,
  kind: ChannelKind,
): Promise<'posted' | 'updated' | 'posted_unpinned'> {
  const payload = { embeds: [guideEmbed(kind, siteUrl())], allowed_mentions: { parse: [] } }
  const existing = ids[channelId]
  if (existing) {
    try {
      await editMessage(channelId, existing, payload)
      return 'updated'
    } catch (err) {
      // Someone deleted the guide: post a new one. Anything else (e.g. no access) is a real error.
      if (discordErrorCode(err) !== UNKNOWN_MESSAGE) throw err
    }
  }
  const msg = await sendMessage(channelId, payload)
  ids[channelId] = msg.id
  try {
    await pinMessage(channelId, msg.id, 'Channel guide')
    return 'posted'
  } catch {
    return 'posted_unpinned'
  }
}

/** The guide for a freshly created team channel. Never throws (a guide is not worth failing a sync). */
export async function postTeamGuide(db: SupabaseClient, channelId: string): Promise<void> {
  try {
    const ids = await loadIds(db)
    await upsertGuide(ids, channelId, 'team')
    await saveIds(db, ids)
  } catch (err) {
    console.error('team guide failed', channelId, err)
  }
}

/** Every league channel set in Admin → Discord, plus every live team channel. */
export async function postAllGuides(db: SupabaseClient): Promise<GuideStats> {
  const stats: GuideStats = { posted: 0, updated: 0, notPinned: 0, failed: 0 }
  const ids = await loadIds(db)
  const channels = await loadChannels(db)

  const targets: [string, ChannelKind][] = []
  for (const kind of ['lfg', 'results', 'disputes', 'admin'] as const) {
    const id = channels[kind]
    if (id) targets.push([id, kind])
  }
  const { data: teams } = await db
    .from('teams')
    .select('discord_channel_id')
    .eq('status', 'approved')
    .not('discord_channel_id', 'is', null)
  for (const t of teams ?? []) targets.push([t.discord_channel_id as string, 'team'])

  for (const [channelId, kind] of targets) {
    try {
      const r = await upsertGuide(ids, channelId, kind)
      if (r === 'updated') stats.updated++
      else stats.posted++
      if (r === 'posted_unpinned') stats.notPinned++
    } catch (err) {
      stats.failed++
      const code = discordErrorCode(err)
      if (code === UNKNOWN_CHANNEL) delete ids[channelId]
      console.error('guide failed', channelId, kind, err)
      // Shown on Admin → Discord with the other sync errors.
      await db.from('discord_sync_errors').insert({
        action: 'post_guides',
        payload: { channel_id: channelId, kind },
        error: (err instanceof Error ? err.message : String(err)).slice(0, 2000),
      })
    }
  }
  await saveIds(db, ids)
  return stats
}

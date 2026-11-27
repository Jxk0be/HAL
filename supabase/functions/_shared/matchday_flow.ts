/**
 * Match-day channels (scheduler, every run). Regular-season and playoff matches only: preseason
 * pairs already have their shared PRESEASON channel.
 *  - open:    15 minutes before the match, a channel both teams (plus admins and casters) can use,
 *             in the "Match Day" category. The id is saved on matches.discord_match_channel_id
 *             before anything is posted, so a retry never makes a second channel.
 *  - archive: once the match is confirmed, forfeited or cancelled, the teams lose access, the
 *             channel moves to a "Match Archive" category (a new one each 50 channels) and stays
 *             for audit. matches.discord_match_channel_closed_at marks it done.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { createChannel, discordErrorCode, editChannel, getGuildChannels, sendMessage, UNKNOWN_CHANNEL, type GuildChannel } from './discord.ts'
import { loadRosterDiscordIds } from './match_data.ts'
import { withMentions } from './match_messages.ts'
import {
  ARCHIVE_CATEGORY,
  archivedNotice,
  archivedOverwrites,
  MATCHDAY_CATEGORY,
  matchChannelName,
  matchdayIntro,
  OPEN_BEFORE,
  OPEN_UNTIL,
  openOverwrites,
  pickCategory,
  SETTLED,
  shouldOpen,
} from './matchday_messages.ts'

const REASON = 'BIL match-day channel'

interface Env {
  guildId: string
  botUserId: string
  adminRoleId: string | null
  casterRoleId: string | null
}

async function loadEnv(db: SupabaseClient): Promise<Env | null> {
  const guildId = Deno.env.get('DISCORD_GUILD_ID')
  const botUserId = Deno.env.get('DISCORD_APP_ID')
  if (!guildId || !botUserId) return null
  const { data } = await db.from('app_settings').select('value').eq('key', 'discord').maybeSingle()
  const roles = (data?.value as { roles?: { admin?: string; caster?: string } } | null)?.roles ?? {}
  return { guildId, botUserId, adminRoleId: roles.admin ?? null, casterRoleId: roles.caster ?? null }
}

async function categoryFor(env: Env, base: string, channels: GuildChannel[]): Promise<string> {
  const pick = pickCategory(base, channels)
  if (pick.id) return pick.id
  const created = await createChannel(env.guildId, { name: pick.name, type: 4, permission_overwrites: [] }, REASON)
  channels.push({ id: created.id, name: pick.name, type: 4, parent_id: null })
  return created.id
}

const TEAM = 'id, name, tag, discord_role_id'
const COLUMNS = `id, week, stage, playoff_round, status, scheduled_at, discord_match_channel_id, home:teams!matches_home_team_id_fkey(${TEAM}), away:teams!matches_away_team_id_fkey(${TEAM})`

type Row = {
  id: string
  week: number
  stage: string
  playoff_round: number | null
  status: string
  scheduled_at: string
  discord_match_channel_id: string | null
  home: { id: string; name: string; tag: string; discord_role_id: string | null }
  away: { id: string; name: string; tag: string; discord_role_id: string | null }
}

/** Opens due channels and archives settled ones. Returns counts; errors per match go to onError. */
export async function syncMatchdayChannels(
  db: SupabaseClient,
  siteUrl: string,
  now: number,
  onError: (what: string, matchId: string, err: unknown) => Promise<void>,
): Promise<{ opened: number; archived: number }> {
  const env = await loadEnv(db)
  if (!env) return { opened: 0, archived: 0 }

  const [{ data: due }, { data: done }] = await Promise.all([
    db
      .from('matches')
      .select(COLUMNS)
      .neq('stage', 'preseason')
      .is('discord_match_channel_id', null)
      .not('status', 'in', `(${SETTLED.join(',')})`)
      .gte('scheduled_at', new Date(now - OPEN_UNTIL).toISOString())
      .lte('scheduled_at', new Date(now + OPEN_BEFORE).toISOString()),
    db
      .from('matches')
      .select(COLUMNS)
      .not('discord_match_channel_id', 'is', null)
      .is('discord_match_channel_closed_at', null)
      .in('status', SETTLED)
      .limit(20),
  ])
  const toOpen = ((due ?? []) as unknown as Row[]).filter((m) => shouldOpen(m.scheduled_at, now))
  const toArchive = (done ?? []) as unknown as Row[]
  if (!toOpen.length && !toArchive.length) return { opened: 0, archived: 0 }

  const channels = await getGuildChannels(env.guildId)
  let opened = 0
  let archived = 0

  for (const m of toOpen) {
    try {
      if (!m.home.discord_role_id || !m.away.discord_role_id) continue // team roles not synced yet; next run
      const parent = await categoryFor(env, MATCHDAY_CATEGORY, channels)
      const ch = await createChannel(
        env.guildId,
        {
          name: matchChannelName(m.week, m.stage, m.playoff_round, m.home, m.away),
          parent_id: parent,
          topic: `${m.home.name} [${m.home.tag}] vs ${m.away.name} [${m.away.tag}]. Kept after the match; admins can read it.`,
          permission_overwrites: openOverwrites({
            guildId: env.guildId,
            teamRoleIds: [m.home.discord_role_id, m.away.discord_role_id],
            adminRoleId: env.adminRoleId,
            casterRoleId: env.casterRoleId,
            botUserId: env.botUserId,
          }),
        },
        REASON,
      )
      channels.push({ id: ch.id, name: '', type: 0, parent_id: parent })
      await db.from('matches').update({ discord_match_channel_id: ch.id }).eq('id', m.id)
      const [home, away] = await Promise.all([loadRosterDiscordIds(db, m.home.id), loadRosterDiscordIds(db, m.away.id)])
      await sendMessage(
        ch.id,
        withMentions(matchdayIntro({ id: m.id, week: m.week, stage: m.stage, scheduledAt: m.scheduled_at, home: m.home, away: m.away }, siteUrl), [...home, ...away]),
      )
      opened++
    } catch (err) {
      await onError('matchday_open', m.id, err)
    }
  }

  for (const m of toArchive) {
    try {
      const channelId = m.discord_match_channel_id!
      if (channels.some((c) => c.id === channelId)) {
        await sendMessage(channelId, archivedNotice(m.status)).catch(() => undefined)
        const parent = await categoryFor(env, ARCHIVE_CATEGORY, channels)
        await editChannel(
          channelId,
          { parent_id: parent, permission_overwrites: archivedOverwrites({ guildId: env.guildId, adminRoleId: env.adminRoleId, botUserId: env.botUserId }) },
          REASON,
        )
        const known = channels.find((c) => c.id === channelId)
        if (known) known.parent_id = parent
      }
      await db.from('matches').update({ discord_match_channel_closed_at: new Date(now).toISOString() }).eq('id', m.id)
      archived++
    } catch (err) {
      if (discordErrorCode(err) === UNKNOWN_CHANNEL) {
        // Deleted by hand: nothing left to archive.
        await db.from('matches').update({ discord_match_channel_closed_at: new Date(now).toISOString() }).eq('id', m.id)
        continue
      }
      await onError('matchday_archive', m.id, err)
    }
  }
  return { opened, archived }
}

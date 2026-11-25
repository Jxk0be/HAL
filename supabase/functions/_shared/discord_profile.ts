/**
 * Keeps profile pictures and display names in step with Discord. Login used to be the only time
 * they were copied, and sessions last weeks. Now discord-sync refreshes them on every user sync
 * (the site asks for one at most every 10 minutes per visitor), and discord-scheduler refreshes a
 * small batch on every run, oldest first, so people who never visit the site stay current too.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { avatarUrlFor, discordErrorCode, getUser, type DiscordUserProfile } from './discord.ts'

const UNKNOWN_USER = 10013

/** What the profile row should hold for this Discord user. Pure. */
export function profileFields(u: DiscordUserProfile): { discord_username: string; avatar_url: string } {
  return { discord_username: u.global_name || u.username, avatar_url: avatarUrlFor(u) }
}

export async function saveDiscordProfile(db: SupabaseClient, profileId: string, u: DiscordUserProfile | null): Promise<void> {
  const patch = u ? profileFields(u) : {}
  await db
    .from('profiles')
    .update({ ...patch, discord_profile_checked_at: new Date().toISOString() })
    .eq('id', profileId)
}

/** Refreshes up to `limit` profiles, least recently checked first. Returns how many were checked. */
export async function refreshDiscordProfiles(db: SupabaseClient, limit = 20): Promise<number> {
  const { data, error } = await db
    .from('profiles')
    .select('id, discord_id')
    .not('discord_id', 'is', null)
    .order('discord_profile_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) throw error
  let n = 0
  for (const p of data ?? []) {
    try {
      await saveDiscordProfile(db, p.id, await getUser(p.discord_id as string))
    } catch (err) {
      // A deleted Discord account: keep what we have, just don't check it first every time.
      if (discordErrorCode(err) !== UNKNOWN_USER) throw err
      await saveDiscordProfile(db, p.id, null)
    }
    n++
  }
  return n
}

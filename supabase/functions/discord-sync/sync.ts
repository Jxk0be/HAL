/**
 * Makes Discord match the database. Every operation recomputes the desired state, so it is safe
 * to run any number of times, in any order.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  addMemberRole,
  createChannel,
  createRole,
  deleteChannel,
  deleteRole,
  discordErrorCode,
  editChannel,
  editRole,
  getGuildChannels,
  getGuildMember,
  getGuildRoles,
  removeMemberRole,
  setRolePositions,
  UNKNOWN_CHANNEL,
  UNKNOWN_MEMBER,
  UNKNOWN_ROLE,
  type GuildRole,
} from '../_shared/discord.ts'
import {
  desiredRoles,
  FIXED_ROLE_SPECS,
  roleDiff,
  TEAM_CATEGORY_NAME,
  TEAM_ROLE_COLOR,
  teamChannelName,
  teamChannelOverwrites,
  teamRolePlacement,
  type DiscordSettings,
  type FixedRoles,
} from './plan.ts'

const ACTIVE = ['signups', 'regular', 'playoffs']
const REASON = 'HAL role sync'

export interface SyncEnv {
  db: SupabaseClient
  guildId: string
  botUserId: string
}

export interface SyncStats {
  teams: number
  users: number
  rolesAdded: number
  rolesRemoved: number
  notInServer: number
  errors: number
}

export const emptyStats = (): SyncStats => ({
  teams: 0,
  users: 0,
  rolesAdded: 0,
  rolesRemoved: 0,
  notInServer: 0,
  errors: 0,
})

/** Ignore "already gone" errors when deleting. */
async function ignoreMissing(p: Promise<unknown>) {
  try {
    await p
  } catch (err) {
    const code = discordErrorCode(err)
    if (code !== UNKNOWN_ROLE && code !== UNKNOWN_CHANNEL) throw err
  }
}

export async function logError(db: SupabaseClient, action: string, payload: unknown, err: unknown) {
  const message = err instanceof Error ? `${err.message}${'body' in err ? ` ${JSON.stringify((err as { body: unknown }).body)}` : ''}` : String(err)
  console.error(action, message)
  await db.from('discord_sync_errors').insert({ action, payload, error: message.slice(0, 2000) })
}

// ---- Fixed roles and the team category ---------------------------------------
export async function ensureSettings(env: SyncEnv, roles?: GuildRole[]): Promise<DiscordSettings> {
  const { db, guildId } = env
  const { data } = await db.from('app_settings').select('value').eq('key', 'discord').maybeSingle()
  const stored = (data?.value ?? {}) as Partial<DiscordSettings>
  const guildRoles = roles ?? (await getGuildRoles(guildId))
  const byId = new Map(guildRoles.map((r) => [r.id, r]))
  const byName = new Map(guildRoles.map((r) => [r.name.toLowerCase(), r]))

  const fixed = {} as FixedRoles
  for (const key of Object.keys(FIXED_ROLE_SPECS) as (keyof FixedRoles)[]) {
    const spec = FIXED_ROLE_SPECS[key]
    const storedId = stored.roles?.[key]
    const existing = storedId ? byId.get(storedId) : undefined
    const sameName = byName.get(spec.name.toLowerCase())
    fixed[key] = existing?.id ?? sameName?.id ?? (await createRole(guildId, { ...spec, hoist: false }, REASON)).id
  }

  const channels = await getGuildChannels(guildId)
  const category =
    channels.find((c) => c.id === stored.team_category_id && c.type === 4) ??
    channels.find((c) => c.type === 4 && c.name.toLowerCase() === TEAM_CATEGORY_NAME.toLowerCase())
  const categoryId = category?.id ?? (await createChannel(guildId, { name: TEAM_CATEGORY_NAME, type: 4 }, REASON)).id

  const settings: DiscordSettings = { roles: fixed, team_category_id: categoryId }
  if (JSON.stringify(settings) !== JSON.stringify({ roles: stored.roles, team_category_id: stored.team_category_id })) {
    await db.from('app_settings').upsert({ key: 'discord', value: settings })
  }
  return settings
}

async function managedRoleIds(db: SupabaseClient, fixed: FixedRoles): Promise<Set<string>> {
  const { data } = await db.from('teams').select('discord_role_id').not('discord_role_id', 'is', null)
  return new Set([...Object.values(fixed), ...(data ?? []).map((t) => t.discord_role_id as string)])
}

// ---- Users -------------------------------------------------------------------
export async function syncUser(
  env: SyncEnv,
  userId: string,
  settings: DiscordSettings,
  stats: SyncStats,
  managed?: Set<string>,
): Promise<void> {
  const { db, guildId } = env
  const { data: profile } = await db
    .from('profiles')
    .select('id, discord_id, is_free_agent, banned_until')
    .eq('id', userId)
    .maybeSingle()
  if (!profile?.discord_id) return

  const [{ data: complete }, { data: staff }, { data: memberships }] = await Promise.all([
    db.rpc('is_profile_complete', { p_user_id: userId }),
    db.from('staff_roles').select('role').eq('user_id', userId),
    db
      .from('team_members')
      .select('team:teams!inner(id, status, captain_id, co_captain_id, discord_role_id, season:seasons!inner(status))')
      .eq('user_id', userId)
      .is('left_at', null)
      .eq('is_emergency', false),
  ])
  // deno-lint-ignore no-explicit-any
  const active = (memberships ?? []).map((m: any) => m.team).find(
    // deno-lint-ignore no-explicit-any
    (t: any) => t.status === 'approved' && ACTIVE.includes(t.season.status) && t.discord_role_id,
  )

  const want = desiredRoles(
    {
      teamRoleId: active?.discord_role_id ?? null,
      isCaptain: Boolean(active && (active.captain_id === userId || active.co_captain_id === userId)),
      isFreeAgent: profile.is_free_agent,
      profileComplete: complete === true,
      banned: Boolean(profile.banned_until && new Date(profile.banned_until) > new Date()),
      staffRoles: (staff ?? []).map((s) => s.role as string),
    },
    settings.roles,
  )

  let current: string[]
  try {
    current = (await getGuildMember(guildId, profile.discord_id)).roles
  } catch (err) {
    if (discordErrorCode(err) === UNKNOWN_MEMBER) {
      stats.notInServer++
      return
    }
    throw err
  }

  const { add, remove } = roleDiff(current, want, managed ?? (await managedRoleIds(db, settings.roles)))
  for (const role of add) await addMemberRole(guildId, profile.discord_id, role, REASON)
  for (const role of remove) await removeMemberRole(guildId, profile.discord_id, role, REASON)
  stats.users++
  stats.rolesAdded += add.length
  stats.rolesRemoved += remove.length
}

// ---- Teams -------------------------------------------------------------------
export async function removeTeamDiscord(env: SyncEnv, roleId: string | null, channelId: string | null) {
  if (channelId) await ignoreMissing(deleteChannel(channelId, REASON))
  if (roleId) await ignoreMissing(deleteRole(env.guildId, roleId, REASON))
}

export async function syncTeam(
  env: SyncEnv,
  teamId: string,
  settings: DiscordSettings,
  stats: SyncStats,
  opts: { syncMembers?: boolean; guildRoles?: GuildRole[]; channelNames?: Map<string, string> } = {},
): Promise<void> {
  const { db, guildId } = env
  const { data: team } = await db
    .from('teams')
    .select('id, name, tag, status, discord_role_id, discord_channel_id, season:seasons!inner(status)')
    .eq('id', teamId)
    .maybeSingle()
  if (!team) return

  // deno-lint-ignore no-explicit-any
  const live = team.status === 'approved' && ACTIVE.includes((team.season as any).status)
  if (!live) {
    if (team.discord_role_id || team.discord_channel_id) {
      await removeTeamDiscord(env, team.discord_role_id, team.discord_channel_id)
      await db.from('teams').update({ discord_role_id: null, discord_channel_id: null }).eq('id', teamId)
    }
    stats.teams++
    return
  }

  // Role: reuse if it still exists, rename if needed, otherwise create.
  const roles = opts.guildRoles ?? (await getGuildRoles(guildId))
  let roleId = team.discord_role_id && roles.some((r) => r.id === team.discord_role_id) ? team.discord_role_id : null
  const created = !roleId
  if (roleId) {
    const role = roles.find((r) => r.id === roleId)
    if (role && role.name !== team.name) await editRole(guildId, roleId, { name: team.name }, REASON)
  } else {
    roleId = (await createRole(guildId, { name: team.name, color: TEAM_ROLE_COLOR, mentionable: true }, REASON)).id
    // Save it straight away so a later failure (e.g. creating the channel) can't orphan the role.
    await db.from('teams').update({ discord_role_id: roleId }).eq('id', teamId)
  }

  // Keep team roles between Player and Captain (Discord creates new roles at the bottom).
  // Cosmetic only, so a failure is logged and the sync carries on.
  try {
    const current = created ? await getGuildRoles(guildId) : roles
    const moves = teamRolePlacement(current, roleId, settings.roles.player, settings.roles.captain)
    if (moves.length) await setRolePositions(guildId, moves, REASON)
  } catch (err) {
    await logError(db, 'role_position', { team_id: teamId }, err)
  }

  // Channel: reuse if it still exists (and refresh name and permissions), otherwise create.
  const channelNames = opts.channelNames ?? new Map((await getGuildChannels(guildId)).map((c) => [c.id, c.name]))
  const overwrites = teamChannelOverwrites({
    guildId,
    teamRoleId: roleId,
    adminRoleId: settings.roles.admin,
    botUserId: env.botUserId,
  })
  const name = teamChannelName(team.tag, team.name)
  let channelId = team.discord_channel_id && channelNames.has(team.discord_channel_id) ? team.discord_channel_id : null
  if (channelId) {
    // Discord allows only 2 renames per channel per 10 minutes, so only send the name when it changed.
    const rename = channelNames.get(channelId) !== name ? { name } : {}
    await editChannel(channelId, { ...rename, parent_id: settings.team_category_id, permission_overwrites: overwrites }, REASON)
  } else {
    channelId = (
      await createChannel(
        guildId,
        {
          name,
          parent_id: settings.team_category_id,
          topic: `${team.name} [${team.tag}] team channel. Match reminders and check-ins land here.`,
          permission_overwrites: overwrites,
        },
        REASON,
      )
    ).id
  }

  if (channelId !== team.discord_channel_id) {
    await db.from('teams').update({ discord_role_id: roleId, discord_channel_id: channelId }).eq('id', teamId)
  }
  stats.teams++

  if (opts.syncMembers !== false) {
    const { data: members } = await db.from('team_members').select('user_id').eq('team_id', teamId).is('left_at', null)
    const managed = await managedRoleIds(db, settings.roles)
    for (const m of members ?? []) {
      try {
        await syncUser(env, m.user_id, settings, stats, managed)
      } catch (err) {
        stats.errors++
        await logError(db, 'user_sync', { user_id: m.user_id, team_id: teamId }, err)
      }
    }
  }
}

// ---- Everything ----------------------------------------------------------------
export async function fullResync(env: SyncEnv): Promise<SyncStats> {
  const { db, guildId } = env
  const stats = emptyStats()
  const guildRoles = await getGuildRoles(guildId)
  const settings = await ensureSettings(env, guildRoles)
  const channelNames = new Map((await getGuildChannels(guildId)).map((c) => [c.id, c.name]))

  // Every team that is live, or that still has Discord ids to clean up.
  const { data: teams } = await db
    .from('teams')
    .select('id, status, discord_role_id, season:seasons!inner(status)')
  for (const t of teams ?? []) {
    // deno-lint-ignore no-explicit-any
    const live = t.status === 'approved' && ACTIVE.includes((t.season as any).status)
    if (!live && !t.discord_role_id) continue
    try {
      // No shared guildRoles here: moving a team role shifts other roles' positions, so each team
      // reads the current order.
      await syncTeam(env, t.id, settings, stats, { syncMembers: false, channelNames })
    } catch (err) {
      stats.errors++
      await logError(db, 'team_sync', { team_id: t.id }, err)
    }
  }

  const managed = await managedRoleIds(db, settings.roles)
  const { data: users } = await db.from('profiles').select('id').not('discord_id', 'is', null)
  for (const u of users ?? []) {
    try {
      await syncUser(env, u.id, settings, stats, managed)
    } catch (err) {
      stats.errors++
      await logError(db, 'user_sync', { user_id: u.id }, err)
    }
  }
  return stats
}

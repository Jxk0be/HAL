/**
 * Pure planning functions for Discord sync: which roles a member should have, and team channel
 * names and permissions. No I/O, so they are unit-tested directly.
 */
import { perms, PERMISSIONS, type PermissionOverwrite } from '../_shared/discord.ts'

export interface FixedRoles {
  captain: string
  free_agent: string
  admin: string
  caster: string
  player: string
}

export interface DiscordSettings {
  roles: FixedRoles
  team_category_id: string
}

export interface UserState {
  /** The team role of the player's active, approved team this season. */
  teamRoleId: string | null
  isCaptain: boolean
  isFreeAgent: boolean
  profileComplete: boolean
  banned: boolean
  staffRoles: string[]
}

/** Roles a member should have, given the database. */
export function desiredRoles(state: UserState, fixed: FixedRoles): Set<string> {
  const want = new Set<string>()
  if (state.teamRoleId) {
    want.add(state.teamRoleId)
    want.add(fixed.player)
    if (state.isCaptain) want.add(fixed.captain)
  } else if (state.isFreeAgent && state.profileComplete && !state.banned) {
    want.add(fixed.free_agent)
  }
  if (state.staffRoles.includes('owner') || state.staffRoles.includes('admin')) want.add(fixed.admin)
  if (state.staffRoles.includes('caster')) want.add(fixed.caster)
  return want
}

/**
 * Role changes for a member. Only roles HAL manages are ever removed; anything else a member has
 * (Nitro booster, community roles) is left alone.
 */
export function roleDiff(
  current: string[],
  desired: Set<string>,
  managed: Set<string>,
): { add: string[]; remove: string[] } {
  const have = new Set(current)
  return {
    add: [...desired].filter((r) => !have.has(r)),
    remove: current.filter((r) => managed.has(r) && !desired.has(r)),
  }
}

/** Team channel name, e.g. "srph-seraphim". */
export function teamChannelName(tag: string, name: string): string {
  const slug = `${tag}-${name}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return (slug || 'team').slice(0, 90)
}

const MANAGE_CHANNELS = 1n << 4n
const MANAGE_ROLES = 1n << 28n

/** Private team channel: hidden from everyone except the team, HAL Admin and the bot. */
export function teamChannelOverwrites(opts: {
  guildId: string
  teamRoleId: string
  adminRoleId: string
  botUserId: string
}): PermissionOverwrite[] {
  const member = perms(
    PERMISSIONS.VIEW_CHANNEL,
    PERMISSIONS.SEND_MESSAGES,
    PERMISSIONS.READ_MESSAGE_HISTORY,
    PERMISSIONS.ATTACH_FILES,
    PERMISSIONS.EMBED_LINKS,
  )
  return [
    { id: opts.guildId, type: 0, deny: perms(PERMISSIONS.VIEW_CHANNEL) }, // @everyone
    { id: opts.teamRoleId, type: 0, allow: member },
    { id: opts.adminRoleId, type: 0, allow: member },
    {
      id: opts.botUserId,
      type: 1,
      allow: perms(
        PERMISSIONS.VIEW_CHANNEL,
        PERMISSIONS.SEND_MESSAGES,
        PERMISSIONS.READ_MESSAGE_HISTORY,
        PERMISSIONS.EMBED_LINKS,
        PERMISSIONS.ATTACH_FILES,
        MANAGE_CHANNELS,
        MANAGE_ROLES,
      ),
    },
  ]
}

/** Fixed role names and colours (created on first full_resync if missing). */
export const FIXED_ROLE_SPECS: Record<keyof FixedRoles, { name: string; color: number }> = {
  admin: { name: 'HAL Admin', color: 0xd4af37 },
  caster: { name: 'HAL Caster', color: 0x8fb8ff },
  captain: { name: 'Captain', color: 0xe6c55a },
  player: { name: 'Player', color: 0x9b978d },
  free_agent: { name: 'Free Agent', color: 0x4fb07c },
}

export const TEAM_ROLE_COLOR = 0xb8a06a
export const TEAM_CATEGORY_NAME = 'Team Channels'

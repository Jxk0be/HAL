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
 * Role changes for a member. Only roles BIL manages are ever removed; anything else a member has
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

/**
 * Mathematical sans-serif bold letters and digits. Discord lowercases ASCII in text channel names
 * but leaves these alone, so team tags and names keep their capitals.
 */
export function boldText(s: string): string {
  return Array.from(s, (ch) => {
    const c = ch.codePointAt(0) ?? 0
    if (c >= 65 && c <= 90) return String.fromCodePoint(0x1d5d4 + c - 65) // A-Z
    if (c >= 97 && c <= 122) return String.fromCodePoint(0x1d5ee + c - 97) // a-z
    if (c >= 48 && c <= 57) return String.fromCodePoint(0x1d7ec + c - 48) // 0-9
    return ch
  }).join('')
}

/** ASCII letters, digits and single dashes (accents dropped, case kept). */
function slug(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Team channel name, e.g. "【𝘁𝗩】𝗧𝗲𝗮𝗺-𝗩𝗲𝗰𝘁𝗼𝗿𝗶𝘇𝗲". Discord strips ASCII [ ] and turns spaces into
 * dashes, but keeps the 【】 brackets and the bold letters. Bold letters are two UTF-16 units each,
 * so the name is capped well under Discord's 100-character limit.
 */
export function teamChannelName(tag: string, name: string): string {
  const t = slug(tag)
  const n = Array.from(slug(name)).slice(0, 40).join('')
  if (!t && !n) return 'team'
  return `${t ? `【${boldText(t)}】` : ''}${boldText(n || 'team')}`
}

/**
 * Private team channel: hidden from everyone except the team, BIL Admin and the bot.
 * The bot's overwrite only lets it see and post: its server-wide Manage Channels already covers
 * editing and deleting. Discord rejects overwrites that grant Manage Channels/Manage Permissions
 * unless the bot is an Administrator, so they must not be included.
 */
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
    { id: opts.botUserId, type: 1, allow: member },
  ]
}

/**
 * Voice channel name, e.g. "🔊 【tV】 Team Vectorize". Voice channels keep spaces and capitals, so
 * plain text reads better than the bold letters used for the text channel.
 */
export function teamVoiceChannelName(tag: string, name: string): string {
  const t = tag.trim()
  const n = name.trim()
  return `🔊 ${t ? `【${t}】 ` : ''}${n || 'Team'}`.slice(0, 100)
}

/**
 * Private team voice channel: same people as the text channel. The team and admins can join,
 * talk, stream and use voice activity. These are all default @everyone permissions, so the bot
 * already holds them and Discord accepts the overwrite. The bot only needs to see the channel to
 * keep it in sync.
 */
export function teamVoiceOverwrites(opts: {
  guildId: string
  teamRoleId: string
  adminRoleId: string
  botUserId: string
}): PermissionOverwrite[] {
  const member = perms(PERMISSIONS.VIEW_CHANNEL, PERMISSIONS.CONNECT, PERMISSIONS.SPEAK, PERMISSIONS.STREAM, PERMISSIONS.USE_VAD)
  return [
    { id: opts.guildId, type: 0, deny: perms(PERMISSIONS.VIEW_CHANNEL, PERMISSIONS.CONNECT) }, // @everyone
    { id: opts.teamRoleId, type: 0, allow: member },
    { id: opts.adminRoleId, type: 0, allow: member },
    { id: opts.botUserId, type: 1, allow: perms(PERMISSIONS.VIEW_CHANNEL) },
  ]
}

export interface RolePosition {
  id: string
  position: number
}

/**
 * Team roles belong between Player and Captain. Returns the role position changes needed to put
 * `roleId` directly above Player, or [] if it already sits between the two (so resyncs don't
 * reshuffle teams). Discord creates new roles at the bottom; @everyone (position 0) never moves.
 */
export function teamRolePlacement(roles: RolePosition[], roleId: string, playerId: string, captainId: string): RolePosition[] {
  const pos = (id: string) => roles.find((r) => r.id === id)?.position
  const role = pos(roleId)
  const player = pos(playerId)
  const captain = pos(captainId)
  if (role === undefined || player === undefined || captain === undefined) return []
  if (role > player && role < captain) return []

  // Discord orders by position, then by id for ties.
  const ordered = roles
    .filter((r) => r.position > 0 && r.id !== roleId)
    .sort((a, b) => a.position - b.position || (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
  const at = ordered.findIndex((r) => r.id === playerId)
  ordered.splice(at + 1, 0, { id: roleId, position: role })
  return ordered
    .map((r, i) => ({ id: r.id, position: i + 1 }))
    .filter((r) => r.position !== roles.find((o) => o.id === r.id)?.position)
}

/** Fixed role names and colours (created on first full_resync if missing). */
export const FIXED_ROLE_SPECS: Record<keyof FixedRoles, { name: string; color: number }> = {
  admin: { name: 'BIL Admin', color: 0xd91f2b },
  caster: { name: 'BIL Caster', color: 0x8fb8ff },
  captain: { name: 'Captain', color: 0xffd23f },
  player: { name: 'Player', color: 0x9b978d },
  free_agent: { name: 'Free Agent', color: 0x4fb07c },
}

export const TEAM_ROLE_COLOR = 0xc99400
export const TEAM_CATEGORY_NAME = 'Team Channels'

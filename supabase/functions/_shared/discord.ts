/**
 * Typed Discord REST helpers. The bot token is read in exactly one place (botToken()).
 * Every call retries on 429 using Discord's retry_after, up to 3 times.
 */

export const DISCORD_API = 'https://discord.com/api/v10'

export class DiscordError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    path: string,
  ) {
    super(`Discord ${status} on ${path}`)
  }
}

function botToken(): string {
  const token = Deno.env.get('DISCORD_BOT_TOKEN')
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not set')
  return token
}

export interface RequestOptions {
  body?: unknown
  /** Shown in the server's audit log. */
  reason?: string
  /** Interaction webhooks are authorised by their token in the URL, not the bot token. */
  auth?: boolean
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function discordRequest<T = unknown>(
  method: string,
  path: string,
  opts: RequestOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const headers: Record<string, string> = { 'User-Agent': 'HALBot (https://github.com, 1.0)' }
  if (opts.auth !== false) headers.Authorization = `Bot ${botToken()}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.reason) headers['X-Audit-Log-Reason'] = encodeURIComponent(opts.reason)

  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(`${DISCORD_API}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
    if (res.status === 429) {
      const data = (await res.json().catch(() => ({}))) as { retry_after?: number }
      const wait = data.retry_after ?? 1
      // Short limits are retried; long ones (e.g. channel renames: 2 per 10 minutes) fail fast so
      // the function doesn't hang. The error is logged and the next sync tries again.
      if (attempt < 3 && wait <= 10) {
        await sleep(Math.ceil(wait * 1000) + 50)
        continue
      }
      throw new DiscordError(429, data, path)
    }
    if (res.status === 204) return undefined as T
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new DiscordError(res.status, data, path)
    return data as T
  }
}

// ---- Types (the subset BIL uses) ------------------------------------------
export interface Embed {
  title?: string
  description?: string
  url?: string
  color?: number
  timestamp?: string
  footer?: { text: string; icon_url?: string }
  fields?: { name: string; value: string; inline?: boolean }[]
  thumbnail?: { url: string }
}
export interface MessagePayload {
  content?: string
  embeds?: Embed[]
  components?: unknown[]
  flags?: number
  allowed_mentions?: { parse?: ('roles' | 'users' | 'everyone')[]; users?: string[]; roles?: string[] }
}
export interface PermissionOverwrite {
  id: string
  type: 0 | 1 // 0 = role, 1 = member
  allow?: string
  deny?: string
}

// Permission bits used for team channels.
export const PERMISSIONS = {
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  ATTACH_FILES: 1n << 15n,
  EMBED_LINKS: 1n << 14n,
  STREAM: 1n << 9n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  USE_VAD: 1n << 25n,
} as const
export const perms = (...bits: bigint[]) => bits.reduce((a, b) => a | b, 0n).toString()

// ---- Messages ------------------------------------------------------------
export const sendMessage = (channelId: string, payload: MessagePayload) =>
  discordRequest<{ id: string }>('POST', `/channels/${channelId}/messages`, { body: payload })

export const editMessage = (channelId: string, messageId: string, payload: MessagePayload) =>
  discordRequest('PATCH', `/channels/${channelId}/messages/${messageId}`, { body: payload })

export const deleteMessage = (channelId: string, messageId: string) =>
  discordRequest('DELETE', `/channels/${channelId}/messages/${messageId}`)

/** Pins a message (needs Pin Messages / Manage Messages in that channel). */
export const pinMessage = (channelId: string, messageId: string, reason?: string) =>
  discordRequest('PUT', `/channels/${channelId}/pins/${messageId}`, { reason })

/** Opens (or reuses) a DM channel with a user. Fails with 50007 if they don't accept DMs. */
export const createDmChannel = (userId: string) =>
  discordRequest<{ id: string }>('POST', '/users/@me/channels', { body: { recipient_id: userId } })

// ---- Interaction responses (no bot token: authorised by the interaction token) ----
export const editOriginalResponse = (appId: string, token: string, payload: MessagePayload) =>
  discordRequest('PATCH', `/webhooks/${appId}/${token}/messages/@original`, { body: payload, auth: false })

export const sendFollowup = (appId: string, token: string, payload: MessagePayload) =>
  discordRequest('POST', `/webhooks/${appId}/${token}`, { body: payload, auth: false })

// ---- Roles -----------------------------------------------------------------
export const createRole = (
  guildId: string,
  role: { name: string; color?: number; mentionable?: boolean; hoist?: boolean },
  reason?: string,
) => discordRequest<{ id: string }>('POST', `/guilds/${guildId}/roles`, { body: role, reason })

export const deleteRole = (guildId: string, roleId: string, reason?: string) =>
  discordRequest('DELETE', `/guilds/${guildId}/roles/${roleId}`, { reason })

export const addMemberRole = (guildId: string, userId: string, roleId: string, reason?: string) =>
  discordRequest('PUT', `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { reason })

export const removeMemberRole = (guildId: string, userId: string, roleId: string, reason?: string) =>
  discordRequest('DELETE', `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { reason })

// ---- Channels and threads ---------------------------------------------------
export const createChannel = (
  guildId: string,
  channel: {
    name: string
    type?: number // 0 = text, 2 = voice, 4 = category
    parent_id?: string
    topic?: string
    permission_overwrites?: PermissionOverwrite[]
  },
  reason?: string,
) => discordRequest<{ id: string }>('POST', `/guilds/${guildId}/channels`, { body: { type: 0, ...channel }, reason })

export const deleteChannel = (channelId: string, reason?: string) =>
  discordRequest('DELETE', `/channels/${channelId}`, { reason })

/** Private thread (type 12) in a text channel; invite members with addThreadMember. */
export const createPrivateThread = (channelId: string, name: string, reason?: string) =>
  discordRequest<{ id: string }>('POST', `/channels/${channelId}/threads`, {
    body: { name: name.slice(0, 100), type: 12, invitable: false, auto_archive_duration: 10080 },
    reason,
  })

export const addThreadMember = (threadId: string, userId: string) =>
  discordRequest('PUT', `/channels/${threadId}/thread-members/${userId}`)

/** Archive/lock (or reopen) a thread. */
export const updateThread = (threadId: string, patch: { archived?: boolean; locked?: boolean }, reason?: string) =>
  discordRequest('PATCH', `/channels/${threadId}`, { body: patch, reason })

// ---- Reads and edits used by role sync -------------------------------------
export interface GuildRole {
  id: string
  name: string
  position: number
}
export interface GuildChannel {
  id: string
  name: string
  type: number
  parent_id?: string | null
}
export interface GuildMember {
  user: { id: string }
  roles: string[]
}

/** Discord error code for "Unknown Member" (user isn't in the server). */
export const UNKNOWN_MEMBER = 10007
export const UNKNOWN_ROLE = 10011
export const UNKNOWN_CHANNEL = 10003
export const UNKNOWN_MESSAGE = 10008
export const CANNOT_DM = 50007

export function discordErrorCode(err: unknown): number | null {
  if (err instanceof DiscordError && err.body && typeof err.body === 'object' && 'code' in err.body) {
    return Number((err.body as { code: unknown }).code)
  }
  return null
}

export const MISSING_ACCESS = 50001
export const MISSING_PERMISSIONS = 50013

/**
 * The text logged to discord_sync_errors (shown on Admin → Discord): the status, Discord's own
 * message, and for the two permission errors a plain fix.
 */
export function describeDiscordError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  if (!(err instanceof DiscordError)) return err.message
  const code = discordErrorCode(err)
  const body = err.body && typeof err.body === 'object' ? (err.body as { message?: unknown }) : null
  let text = err.message
  if (body?.message) text += `: ${String(body.message)}${code ? ` (${code})` : ''}`
  if (code === MISSING_ACCESS) {
    text +=
      ". The bot can't see this channel. In its permissions, add the Blackhat Bot role with View Channel and Send Messages allowed."
  } else if (code === MISSING_PERMISSIONS) {
    text +=
      '. The bot is missing a permission here. Add the Blackhat Bot role to this channel (or its category) with View Channel, Send Messages, Embed Links, Read Message History and Manage Messages allowed, and keep its role above the roles it hands out.'
  }
  return text
}

export const getGuildRoles = (guildId: string) => discordRequest<GuildRole[]>('GET', `/guilds/${guildId}/roles`)

export const getGuildChannels = (guildId: string) =>
  discordRequest<GuildChannel[]>('GET', `/guilds/${guildId}/channels`)

export const getGuildMember = (guildId: string, userId: string) =>
  discordRequest<GuildMember>('GET', `/guilds/${guildId}/members/${userId}`)

export const editRole = (guildId: string, roleId: string, patch: { name?: string; color?: number }, reason?: string) =>
  discordRequest('PATCH', `/guilds/${guildId}/roles/${roleId}`, { body: patch, reason })

/** Bulk-move roles. Only roles below the bot's highest role can be moved. */
export const setRolePositions = (guildId: string, positions: { id: string; position: number }[], reason?: string) =>
  discordRequest('PATCH', `/guilds/${guildId}/roles`, { body: positions, reason })

export const editChannel = (
  channelId: string,
  patch: { name?: string; parent_id?: string; topic?: string; permission_overwrites?: PermissionOverwrite[] },
  reason?: string,
) => discordRequest('PATCH', `/channels/${channelId}`, { body: patch, reason })

/** "Target user is not connected to voice": the bot can only move people already in a voice channel. */
export const NOT_IN_VOICE = 40032

/** Moves a member into a voice channel (needs Move Members, and Connect on the target channel). */
export const moveMember = (guildId: string, userId: string, channelId: string, reason?: string) =>
  discordRequest('PATCH', `/guilds/${guildId}/members/${userId}`, { body: { channel_id: channelId }, reason })

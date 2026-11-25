/**
 * Discord interaction router. Pure: all I/O (database, Discord REST) comes in through `deps`, so
 * the router can be unit-tested without Discord or Supabase.
 *
 * Handlers return either an immediate response, or a deferred one: the router answers Discord
 * at once (type 5 for commands/modals, type 6 for components) and returns a `background` promise
 * that does the work and edits the original response. The function runs it with
 * EdgeRuntime.waitUntil. Discord needs the first response within 3 seconds.
 */
import type { MessagePayload } from './discord.ts'
import { noticeEmbed } from './embeds.ts'

export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const

export const ResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE: 4,
  DEFERRED_CHANNEL_MESSAGE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
  AUTOCOMPLETE_RESULT: 8,
  MODAL: 9,
} as const

export const EPHEMERAL = 1 << 6

export interface DiscordUser {
  id: string
  username: string
  global_name?: string | null
}

export interface DiscordAttachment {
  id: string
  url: string
  filename: string
  size: number
  content_type?: string
}

export interface Interaction {
  id: string
  application_id: string
  type: number
  token: string
  guild_id?: string
  channel_id?: string
  member?: { user: DiscordUser; roles?: string[] }
  user?: DiscordUser
  data?: {
    name?: string
    options?: { name: string; value?: unknown; focused?: boolean; options?: unknown[] }[]
    custom_id?: string
    values?: string[]
    components?: unknown[]
    /** Attachments (and other objects) referenced by command options, keyed by id. */
    resolved?: { attachments?: Record<string, DiscordAttachment> }
  }
  message?: { id: string }
}

export interface InteractionResponse {
  type: number
  data?: MessagePayload | { choices: { name: string; value: string }[] } | Record<string, unknown>
}

/** A BIL player linked to the Discord user (null if they never logged in to the site). */
export interface HalProfile {
  id: string
  discordUsername: string | null
  activisionId: string | null
}

export interface Deps {
  siteUrl: string
  getProfileByDiscordId(discordId: string): Promise<HalProfile | null>
  editOriginal(appId: string, token: string, payload: MessagePayload): Promise<unknown>
}

export interface Context {
  interaction: Interaction
  user: DiscordUser
  /** Present unless the handler is marked `public` (works without a BIL account). */
  profile: HalProfile | null
  deps: Deps
  /** custom_id parts for components and modals: "feature:action:id". */
  action?: string
  id?: string
}

export type Reply =
  | { kind: 'message'; payload: MessagePayload; ephemeral?: boolean }
  | { kind: 'update'; payload: MessagePayload }
  | { kind: 'modal'; data: Record<string, unknown> }
  | { kind: 'autocomplete'; choices: { name: string; value: string }[] }
  /**
   * Answer later. On a button or select, the default edits the message it is attached to;
   * newMessage: true sends a new (optionally ephemeral) reply instead.
   */
  | { kind: 'deferred'; ephemeral?: boolean; newMessage?: boolean; work: () => Promise<MessagePayload> }

export interface Handler {
  /** Works without a linked BIL profile (e.g. /ping). */
  public?: boolean
  run(ctx: Context): Reply | Promise<Reply>
}

export interface Registry {
  commands: Record<string, Handler>
  /** Keyed by the first part of custom_id ("feature"). */
  components: Record<string, Handler>
  modals: Record<string, Handler>
  autocomplete: Record<string, Handler>
}

export interface RouteResult {
  response: InteractionResponse
  /** Work to finish after responding (deferred replies). */
  background?: Promise<void>
}

export function parseCustomId(customId: string): { feature: string; action?: string; id?: string } {
  const [feature = '', action, ...rest] = customId.split(':')
  return { feature, action, id: rest.length ? rest.join(':') : undefined }
}

export const ephemeral = (description: string, tone: 'info' | 'success' | 'error' = 'info'): Reply => ({
  kind: 'message',
  ephemeral: true,
  payload: { embeds: [noticeEmbed(description, tone)] },
})

function toResponse(reply: Reply, i: Interaction, deps: Deps): RouteResult {
  switch (reply.kind) {
    case 'message':
      return {
        response: {
          type: ResponseType.CHANNEL_MESSAGE,
          data: {
            allowed_mentions: { parse: [] },
            ...reply.payload,
            flags: reply.ephemeral ? EPHEMERAL : reply.payload.flags,
          },
        },
      }
    case 'update':
      return { response: { type: ResponseType.UPDATE_MESSAGE, data: reply.payload } }
    case 'modal':
      return { response: { type: ResponseType.MODAL, data: reply.data } }
    case 'autocomplete':
      return { response: { type: ResponseType.AUTOCOMPLETE_RESULT, data: { choices: reply.choices.slice(0, 25) } } }
    case 'deferred': {
      const updatesMessage = i.type === InteractionType.MESSAGE_COMPONENT && !reply.newMessage
      const background = (async () => {
        let payload: MessagePayload
        try {
          payload = await reply.work()
        } catch (err) {
          console.error('deferred handler failed', err)
          payload = { embeds: [noticeEmbed('Something went wrong. Please try again.', 'error')] }
        }
        await deps.editOriginal(i.application_id, i.token, { allowed_mentions: { parse: [] }, ...payload })
      })()
      return {
        response: updatesMessage
          ? { type: ResponseType.DEFERRED_UPDATE_MESSAGE }
          : { type: ResponseType.DEFERRED_CHANNEL_MESSAGE, data: reply.ephemeral ? { flags: EPHEMERAL } : {} },
        background,
      }
    }
  }
}

export function notLinkedReply(siteUrl: string): Reply {
  return ephemeral(
    `Your Discord account isn't linked to Blackhat yet. [Log in on the site](${siteUrl}/login) with Discord, then try again.`,
    'error',
  )
}

export async function route(interaction: Interaction, registry: Registry, deps: Deps): Promise<RouteResult> {
  if (interaction.type === InteractionType.PING) return { response: { type: ResponseType.PONG } }

  const user = interaction.member?.user ?? interaction.user
  if (!user) return toResponse(ephemeral('Unknown user.', 'error'), interaction, deps)

  let handler: Handler | undefined
  let action: string | undefined
  let id: string | undefined
  switch (interaction.type) {
    case InteractionType.APPLICATION_COMMAND:
      handler = registry.commands[interaction.data?.name ?? '']
      break
    case InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE:
      handler = registry.autocomplete[interaction.data?.name ?? '']
      break
    case InteractionType.MESSAGE_COMPONENT:
    case InteractionType.MODAL_SUBMIT: {
      const parsed = parseCustomId(interaction.data?.custom_id ?? '')
      const table = interaction.type === InteractionType.MODAL_SUBMIT ? registry.modals : registry.components
      handler = table[parsed.feature]
      action = parsed.action
      id = parsed.id
      break
    }
  }

  if (!handler) {
    if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
      return toResponse({ kind: 'autocomplete', choices: [] }, interaction, deps)
    }
    return toResponse(ephemeral('That command is not available right now.', 'error'), interaction, deps)
  }

  let profile: HalProfile | null = null
  if (!handler.public) {
    profile = await deps.getProfileByDiscordId(user.id)
    if (!profile) {
      if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
        return toResponse({ kind: 'autocomplete', choices: [] }, interaction, deps)
      }
      return toResponse(notLinkedReply(deps.siteUrl), interaction, deps)
    }
  }

  try {
    const reply = await handler.run({ interaction, user, profile, deps, action, id })
    return toResponse(reply, interaction, deps)
  } catch (err) {
    console.error('handler failed', err)
    return toResponse(ephemeral('Something went wrong. Please try again.', 'error'), interaction, deps)
  }
}

import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  EPHEMERAL,
  InteractionType,
  ResponseType,
  ephemeral,
  parseCustomId,
  route,
  type Deps,
  type Interaction,
  type Registry,
} from './interactions.ts'
import type { MessagePayload } from './discord.ts'
import { registry as halRegistry } from '../discord-interactions/handlers.ts'

function makeDeps(linked: boolean) {
  const edits: MessagePayload[] = []
  const deps: Deps = {
    siteUrl: 'https://hal.example',
    getProfileByDiscordId: (id) =>
      Promise.resolve(linked ? { id: 'p-' + id, discordUsername: 'kairo', activisionId: 'Kairo#1234567' } : null),
    editOriginal: (_app, _token, payload) => {
      edits.push(payload)
      return Promise.resolve()
    },
  }
  return { deps, edits }
}

const base = (type: number, data?: Interaction['data']): Interaction => ({
  id: '1',
  application_id: 'app',
  type,
  token: 'tok',
  guild_id: 'g',
  member: { user: { id: 'u1', username: 'kairo' } },
  data,
})

const seen: string[] = []
const testRegistry: Registry = {
  commands: {
    open: { public: true, run: () => ephemeral('open') },
    private: { run: ({ profile }) => ephemeral(`hi ${profile?.id}`) },
    slow: { public: true, run: () => ({ kind: 'deferred', ephemeral: true, work: () => Promise.resolve({ content: 'done' }) }) },
    broken: { public: true, run: () => { throw new Error('boom') } },
  },
  components: {
    team: {
      public: true,
      run: ({ action, id }) => {
        seen.push(`${action}/${id}`)
        return { kind: 'deferred', work: () => Promise.resolve({ content: 'updated' }) }
      },
    },
  },
  modals: {},
  autocomplete: {
    open: { public: true, run: () => ({ kind: 'autocomplete', choices: [{ name: 'A', value: 'a' }] }) },
  },
}

Deno.test('answers PING with PONG', async () => {
  const { deps } = makeDeps(false)
  const r = await route(base(InteractionType.PING), testRegistry, deps)
  assertEquals(r.response, { type: ResponseType.PONG })
})

Deno.test('routes commands and makes ephemeral replies', async () => {
  const { deps } = makeDeps(false)
  const r = await route(base(InteractionType.APPLICATION_COMMAND, { name: 'open' }), testRegistry, deps)
  assertEquals(r.response.type, ResponseType.CHANNEL_MESSAGE)
  assertEquals((r.response.data as MessagePayload).flags, EPHEMERAL)
})

Deno.test('asks unlinked users to log in for non-public handlers', async () => {
  const { deps } = makeDeps(false)
  const r = await route(base(InteractionType.APPLICATION_COMMAND, { name: 'private' }), testRegistry, deps)
  const text = JSON.stringify(r.response.data)
  assert(text.includes('https://hal.example/login'))
})

Deno.test('passes the linked profile to handlers', async () => {
  const { deps } = makeDeps(true)
  const r = await route(base(InteractionType.APPLICATION_COMMAND, { name: 'private' }), testRegistry, deps)
  assert(JSON.stringify(r.response.data).includes('hi p-u1'))
})

Deno.test('defers slow commands (type 5) and edits the original response', async () => {
  const { deps, edits } = makeDeps(false)
  const r = await route(base(InteractionType.APPLICATION_COMMAND, { name: 'slow' }), testRegistry, deps)
  assertEquals(r.response, { type: ResponseType.DEFERRED_CHANNEL_MESSAGE, data: { flags: EPHEMERAL } })
  await r.background
  assertEquals(edits[0]?.content, 'done')
})

Deno.test('routes components by custom_id and defers with type 6', async () => {
  const { deps, edits } = makeDeps(false)
  const r = await route(base(InteractionType.MESSAGE_COMPONENT, { custom_id: 'team:accept:abc:def' }), testRegistry, deps)
  assertEquals(r.response.type, ResponseType.DEFERRED_UPDATE_MESSAGE)
  await r.background
  assertEquals(seen.at(-1), 'accept/abc:def')
  assertEquals(edits[0]?.content, 'updated')
})

Deno.test('handles unknown commands, autocomplete and handler errors', async () => {
  const { deps } = makeDeps(false)
  const unknown = await route(base(InteractionType.APPLICATION_COMMAND, { name: 'nope' }), testRegistry, deps)
  assert(JSON.stringify(unknown.response.data).includes('not available'))
  const ac = await route(base(InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE, { name: 'open' }), testRegistry, deps)
  assertEquals(ac.response, { type: ResponseType.AUTOCOMPLETE_RESULT, data: { choices: [{ name: 'A', value: 'a' }] } })
  const broken = await route(base(InteractionType.APPLICATION_COMMAND, { name: 'broken' }), testRegistry, deps)
  assert(JSON.stringify(broken.response.data).includes('Something went wrong'))
})

Deno.test('parseCustomId', () => {
  assertEquals(parseCustomId('checkin:open:123'), { feature: 'checkin', action: 'open', id: '123' })
  assertEquals(parseCustomId('lfg'), { feature: 'lfg', action: undefined, id: undefined })
})

Deno.test('/ping and /link', async () => {
  const unlinked = makeDeps(false).deps
  const ping = await route(base(InteractionType.APPLICATION_COMMAND, { name: 'ping' }), halRegistry, unlinked)
  assert(JSON.stringify(ping.response.data).includes('HAL bot online'))
  const notLinked = await route(base(InteractionType.APPLICATION_COMMAND, { name: 'link' }), halRegistry, unlinked)
  assert(JSON.stringify(notLinked.response.data).includes('https://hal.example/login'))
  const linked = await route(base(InteractionType.APPLICATION_COMMAND, { name: 'link' }), halRegistry, makeDeps(true).deps)
  assert(JSON.stringify(linked.response.data).includes('https://hal.example/players/p-u1'))
})

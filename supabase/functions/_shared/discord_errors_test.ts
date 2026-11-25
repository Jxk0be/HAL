import { assert, assertEquals } from 'jsr:@std/assert@1'
import { describeDiscordError, DiscordError } from './discord.ts'

Deno.test('describeDiscordError explains a missing permission', () => {
  const text = describeDiscordError(
    new DiscordError(403, { message: 'Missing Permissions', code: 50013 }, '/channels/1/messages'),
  )
  assert(text.startsWith('Discord 403 on /channels/1/messages: Missing Permissions (50013)'))
  assert(text.includes('Blackhat Bot role'))
})

Deno.test('describeDiscordError explains a hidden channel', () => {
  const text = describeDiscordError(new DiscordError(403, { message: 'Missing Access', code: 50001 }, '/channels/2/messages'))
  assert(text.includes("can't see this channel"))
})

Deno.test('describeDiscordError keeps other errors plain', () => {
  assertEquals(
    describeDiscordError(new DiscordError(404, { message: 'Unknown Guild', code: 10004 }, '/guilds/3/roles')),
    'Discord 404 on /guilds/3/roles: Unknown Guild (10004)',
  )
  assertEquals(describeDiscordError(new Error('boom')), 'boom')
  assertEquals(describeDiscordError('x'), 'x')
})

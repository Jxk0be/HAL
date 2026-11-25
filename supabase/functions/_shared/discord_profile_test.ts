import { assertEquals } from 'jsr:@std/assert@1'
import { profileFields } from './discord_profile.ts'

Deno.test('profile fields use the display name and the avatar URL Discord login would give', () => {
  assertEquals(profileFields({ id: '345994872550981634', username: 'jake', global_name: 'Jake', avatar: '5b3662d4926235f2081cd972b13a00ed' }), {
    discord_username: 'Jake',
    avatar_url: 'https://cdn.discordapp.com/avatars/345994872550981634/5b3662d4926235f2081cd972b13a00ed.png',
  })
})

Deno.test('animated avatars are gifs; no display name falls back to the username', () => {
  const f = profileFields({ id: '1', username: 'kairo', global_name: null, avatar: 'a_abc' })
  assertEquals(f.discord_username, 'kairo')
  assertEquals(f.avatar_url, 'https://cdn.discordapp.com/avatars/1/a_abc.gif')
})

Deno.test('no avatar uses the default avatar for that account', () => {
  // (345994872550981634 >> 22) % 6 = 4
  assertEquals(profileFields({ id: '345994872550981634', username: 'x', avatar: null }).avatar_url, 'https://cdn.discordapp.com/embed/avatars/4.png')
})

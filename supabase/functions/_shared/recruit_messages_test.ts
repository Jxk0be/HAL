import { assertEquals } from 'jsr:@std/assert@1'
import { interestNotice, recruitPostMessage, type RecruitPost } from './recruit_messages.ts'

const post: RecruitPost = {
  id: 'p1',
  teamId: 't1',
  teamName: 'Night Owls',
  teamTag: 'NO',
  logoUrl: 'https://cdn.example/logo.png',
  lookingFor: 'sub',
  role: 'SMG',
  availability: 'Weeknights after 8 PM ET',
  note: 'Chill comms, want to win.',
  open: 2,
  startersOpen: 0,
  subsOpen: 2,
}

Deno.test('recruiting card names the team, never pings and has the interest button', () => {
  const msg = recruitPostMessage(post, 'https://hal.example')
  assertEquals(msg.allowed_mentions, { parse: [] })
  assertEquals(msg.content, '**Night Owls** [NO] is looking for a sub')
  const e = msg.embeds![0]!
  assertEquals(e.url, 'https://hal.example/teams/t1')
  assertEquals(e.thumbnail, { url: 'https://cdn.example/logo.png' })
  assertEquals(e.fields![0], { name: 'Looking for', value: 'Sub', inline: true })
  assertEquals(e.fields![2], { name: 'Open spots', value: '2 sub', inline: true })
  assertEquals(e.fields![3]!.name, 'When they play')
  // deno-lint-ignore no-explicit-any
  assertEquals((msg.components![0] as any).components[0].custom_id, 'recruit:interest:p1')
})

Deno.test('recruiting card without optional bits', () => {
  const msg = recruitPostMessage({ ...post, lookingFor: 'any', role: null, availability: null, note: null, logoUrl: null, startersOpen: 1, subsOpen: 1 }, 'https://x')
  assertEquals(msg.content, '**Night Owls** [NO] is looking for a starter or sub')
  assertEquals(msg.embeds![0]!.fields!.length, 3)
  assertEquals(msg.embeds![0]!.fields![1]!.value, 'Any')
  assertEquals(msg.embeds![0]!.fields![2]!.value, '1 starter, 1 sub')
  assertEquals(msg.embeds![0]!.thumbnail, undefined)
})

Deno.test('interest notice pings only the captains', () => {
  const msg = interestNotice({ id: 'u1', name: 'kairo', discordId: '42', role: 'AR' }, ['7', '8'], 'https://x')
  assertEquals(msg.content, '<@7> <@8>')
  assertEquals(msg.allowed_mentions, { parse: [], users: ['7', '8'] })
  assertEquals(msg.embeds![0]!.title, 'kairo is interested in joining')
  assertEquals(msg.embeds![0]!.description!.includes('(plays AR)'), true)
})

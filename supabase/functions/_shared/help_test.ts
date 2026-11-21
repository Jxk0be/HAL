import { assertEquals } from 'jsr:@std/assert@1'
import { GUIDE_KINDS, guideEmbed, helpEmbeds, type ChannelKind } from './help.ts'
import { COMMANDS } from './commands.ts'

const SITE = 'https://hal.example'
const ALL: ChannelKind[] = ['team', 'lfg', 'results', 'disputes', 'announcements', 'admin', 'other']

const text = (kind: ChannelKind) => {
  const e = guideEmbed(kind, SITE)
  return [e.title, e.description, ...(e.fields ?? []).flatMap((f) => [f.name, f.value])].join('\n')
}

Deno.test('every command a guide mentions is registered', () => {
  const registered = new Set(COMMANDS.map((c) => c.name))
  for (const kind of ALL) {
    for (const [, name] of text(kind).matchAll(/`\/([a-z]+)/g)) {
      assertEquals(registered.has(name!), true, `/${name} in the ${kind} guide is not a registered command`)
    }
  }
})

Deno.test('help itself is a registered command', () => {
  assertEquals(COMMANDS.some((c) => c.name === 'help'), true)
})

Deno.test('guides fit Discord embed limits', () => {
  for (const kind of ALL) {
    const e = guideEmbed(kind, SITE)
    assertEquals((e.title ?? '').length <= 256, true)
    assertEquals((e.description ?? '').length <= 4096, true)
    assertEquals((e.fields ?? []).length <= 25, true)
    for (const f of e.fields ?? []) {
      assertEquals(f.name.length <= 256 && f.value.length <= 1024, true, `${kind}: field "${f.name}" too long`)
    }
    assertEquals(text(kind).length <= 6000, true)
  }
})

Deno.test('channel-specific commands show up where they belong', () => {
  assertEquals(text('team').includes('`/report`'), true)
  assertEquals(text('team').includes('`/reschedule`'), true)
  assertEquals(text('lfg').includes('`/lfg post`'), true)
  assertEquals(text('lfg').includes('`/report`'), false)
  assertEquals(GUIDE_KINDS.includes('announcements' as never), false)
})

Deno.test('help tells unlinked users to log in and players who can use captain commands', () => {
  const [unlinked] = helpEmbeds('lfg', { linked: false, captain: false }, SITE)
  assertEquals(unlinked!.description!.startsWith("You're not on HAL yet"), true)

  const [captain] = helpEmbeds('team', { linked: true, captain: true, teamName: 'Team Vectorize' }, SITE)
  assertEquals(captain!.description!.startsWith("You're a captain of Team Vectorize"), true)

  const [player] = helpEmbeds('team', { linked: true, captain: false }, SITE)
  assertEquals(player!.description!.startsWith('Only your captain and co-captain'), true)

  // Outside a team channel a linked user just gets the guide.
  const [plain] = helpEmbeds('results', { linked: true, captain: false }, SITE)
  assertEquals(plain!.description, guideEmbed('results', SITE).description)
})

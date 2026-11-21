import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1'
import { hexToBytes, verifyDiscordSignature } from './verify.ts'

const toHex = (b: ArrayBuffer | Uint8Array) =>
  Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('')

async function keyPair() {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const publicHex = toHex(await crypto.subtle.exportKey('raw', pair.publicKey))
  const sign = async (msg: string) =>
    toHex(await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(msg)))
  return { publicHex, sign }
}

const now = Date.UTC(2026, 10, 20, 12, 0, 0)
const ts = String(Math.floor(now / 1000))
const body = '{"type":1}'

Deno.test('accepts a valid signature', async () => {
  const { publicHex, sign } = await keyPair()
  assert(await verifyDiscordSignature(publicHex, await sign(ts + body), ts, body, now))
})

Deno.test('rejects a tampered body', async () => {
  const { publicHex, sign } = await keyPair()
  assertFalse(await verifyDiscordSignature(publicHex, await sign(ts + body), ts, '{"type":2}', now))
})

Deno.test('rejects a signature from another key', async () => {
  const a = await keyPair()
  const b = await keyPair()
  assertFalse(await verifyDiscordSignature(a.publicHex, await b.sign(ts + body), ts, body, now))
})

Deno.test('rejects missing headers, bad hex and stale timestamps', async () => {
  const { publicHex, sign } = await keyPair()
  const sig = await sign(ts + body)
  assertFalse(await verifyDiscordSignature(publicHex, null, ts, body, now))
  assertFalse(await verifyDiscordSignature(publicHex, sig, null, body, now))
  assertFalse(await verifyDiscordSignature(publicHex, 'zz', ts, body, now))
  assertFalse(await verifyDiscordSignature('', sig, ts, body, now))
  const old = String(Math.floor(now / 1000) - 3600)
  assertFalse(await verifyDiscordSignature(publicHex, await sign(old + body), old, body, now))
})

Deno.test('hexToBytes', () => {
  assertEquals([...hexToBytes('00ff10')], [0, 255, 16])
})

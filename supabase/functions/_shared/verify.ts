/**
 * Discord interaction signature check (Ed25519 over timestamp + raw body) using WebCrypto.
 * Discord sends X-Signature-Ed25519 and X-Signature-Timestamp on every request; anything that
 * fails this check must get a 401, which Discord itself tests when you save the endpoint URL.
 */

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error('invalid hex')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

const keyCache = new Map<string, Promise<CryptoKey>>()

function importKey(publicKeyHex: string): Promise<CryptoKey> {
  let key = keyCache.get(publicKeyHex)
  if (!key) {
    key = crypto.subtle.importKey('raw', hexToBytes(publicKeyHex), { name: 'Ed25519' }, false, ['verify'])
    keyCache.set(publicKeyHex, key)
  }
  return key
}

/** Max clock skew accepted for X-Signature-Timestamp (replay protection). */
const MAX_AGE_SECONDS = 5 * 60

export async function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string | null,
  timestamp: string | null,
  rawBody: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!signatureHex || !timestamp || !publicKeyHex) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > MAX_AGE_SECONDS) return false
  try {
    const key = await importKey(publicKeyHex)
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      hexToBytes(signatureHex),
      new TextEncoder().encode(timestamp + rawBody),
    )
  } catch {
    return false
  }
}

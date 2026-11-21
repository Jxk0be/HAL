/**
 * HAL Discord interactions endpoint (HTTP interactions; no gateway process).
 * Deploy with --no-verify-jwt: Discord can't send a Supabase JWT, so the Ed25519 signature check
 * below is the authentication. Set this function's URL as the app's Interactions Endpoint URL.
 *
 * Secrets: DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN, DISCORD_APP_ID, DISCORD_GUILD_ID, SITE_URL
 * (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase).
 */
import { verifyDiscordSignature } from '../_shared/verify.ts'
import { route, type Deps, type Interaction } from '../_shared/interactions.ts'
import { editOriginalResponse } from '../_shared/discord.ts'
import { adminClient } from '../_shared/supabase.ts'
import { registry } from './handlers.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const deps: Deps = {
  siteUrl: (Deno.env.get('SITE_URL') ?? 'http://localhost:5174').replace(/\/+$/, ''),
  async getProfileByDiscordId(discordId) {
    const { data } = await adminClient()
      .from('profiles')
      .select('id, discord_username, activision_id')
      .eq('discord_id', discordId)
      .maybeSingle()
    return data ? { id: data.id, discordUsername: data.discord_username, activisionId: data.activision_id } : null
  },
  editOriginal: editOriginalResponse,
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const publicKey = Deno.env.get('DISCORD_PUBLIC_KEY') ?? ''
  const body = await req.text()
  const valid = await verifyDiscordSignature(
    publicKey,
    req.headers.get('X-Signature-Ed25519'),
    req.headers.get('X-Signature-Timestamp'),
    body,
  )
  if (!valid) return new Response('invalid request signature', { status: 401 })

  let interaction: Interaction
  try {
    interaction = JSON.parse(body)
  } catch {
    return new Response('bad request', { status: 400 })
  }

  const { response, background } = await route(interaction, registry, deps)
  if (background) {
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(background)
    else background.catch((err) => console.error(err))
  }
  return json(response)
})

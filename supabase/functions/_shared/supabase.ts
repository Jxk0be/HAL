import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

let client: SupabaseClient | null = null

/**
 * Service-role client for Edge Functions. It bypasses RLS, so every permission must be
 * re-checked in code with the *_for(user_id, ...) SQL helpers (see permissions.ts).
 */
export function adminClient(): SupabaseClient {
  if (!client) {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return client
}

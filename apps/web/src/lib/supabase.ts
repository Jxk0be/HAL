import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (see apps/web/.env.example)',
  )
}

/** The single Supabase client. Components go through composables/stores, never this directly. */
export const supabase = createClient<Database>(url, key, {
  auth: {
    // PKCE: the OAuth redirect carries a one-time ?code that the client exchanges on load
    // (detectSessionInUrl), instead of tokens in the URL fragment.
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
})

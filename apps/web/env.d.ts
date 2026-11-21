/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  readonly VITE_DISCORD_INVITE_URL: string
  readonly VITE_RULEBOOK_REPO: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Last commit touching rules/rulebook.md at build time (see vite.config.ts). */
declare const __RULEBOOK_COMMIT__: { date: string; message: string } | null

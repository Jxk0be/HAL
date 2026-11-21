/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  readonly VITE_DISCORD_INVITE_URL: string
  /** Public site URL, e.g. https://hal.netlify.app (Open Graph tags, Discord links). */
  readonly VITE_SITE_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Last commit touching rules/rulebook.md at build time (see vite.config.ts). */
declare const __RULEBOOK_COMMIT__: { date: string } | null

/** Short commit hash of this build (Netlify COMMIT_REF or git), or "dev". */
declare const __APP_RELEASE__: string

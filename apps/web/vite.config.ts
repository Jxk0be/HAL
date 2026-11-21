/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

/** Last commit that touched the rulebook, baked in at build time (fallback for the Rules page). */
function rulebookCommit(): { date: string } | null {
  try {
    const out = execSync('git log -1 --format=%cI -- rules/rulebook.md', {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out ? { date: out } : null
  } catch {
    return null
  }
}

/** Short commit of this build: Netlify sets COMMIT_REF; locally ask git. */
function release(): string {
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'dev'
  } catch {
    return 'dev'
  }
}

/** Fills %HAL_SITE_URL% in index.html (absolute Open Graph URLs) from VITE_SITE_URL; empty locally. */
function siteUrl(): Plugin {
  let url = ''
  return {
    name: 'hal-site-url',
    configResolved(config) {
      url = (loadEnv(config.mode, config.envDir || process.cwd(), 'VITE_').VITE_SITE_URL ?? '').replace(/\/+$/, '')
    },
    transformIndexHtml: (html) => html.replaceAll('%HAL_SITE_URL%', url),
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), siteUrl()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    __RULEBOOK_COMMIT__: JSON.stringify(rulebookCommit()),
    __APP_RELEASE__: JSON.stringify(release()),
  },
  // 5174 so HAL can run alongside other local Vite apps on the default 5173.
  server: { port: 5174, strictPort: true },
  test: { environment: 'jsdom' },
})

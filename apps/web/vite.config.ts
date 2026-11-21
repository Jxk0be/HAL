/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

/** Last commit that touched the rulebook, baked in at build time (fallback for the Rules page). */
function rulebookCommit(): { date: string; message: string } | null {
  try {
    const out = execSync('git log -1 --format=%cI%x1f%s -- rules/rulebook.md', {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const [date, message] = out.split('\x1f')
    return date ? { date, message: message ?? '' } : null
  } catch {
    return null
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    __RULEBOOK_COMMIT__: JSON.stringify(rulebookCommit()),
  },
  // 5174 so HAL can run alongside other local Vite apps on the default 5173.
  server: { port: 5174, strictPort: true },
  test: { environment: 'jsdom' },
})

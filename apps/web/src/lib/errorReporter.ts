/**
 * Sends uncaught errors to the client_errors table (log_client_error RPC, rate-limited in the
 * database). At most 5 distinct errors per page load; off in development. Admins see them on
 * /admin/health.
 */
import type { App } from 'vue'
import type { Router } from 'vue-router'
import { supabase } from './supabase'

const MAX_PER_PAGE = 5
const seen = new Set<string>()

/** Noise that isn't a site bug. */
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /Non-Error promise rejection captured/i]

function sessionId(): string {
  try {
    let id = sessionStorage.getItem('hal:session-id')
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      sessionStorage.setItem('hal:session-id', id)
    }
    return id
  } catch {
    return 'no-storage'
  }
}

export function describeError(err: unknown): { message: string; stack: string | null } {
  if (err instanceof Error) return { message: `${err.name}: ${err.message}`, stack: err.stack ?? null }
  if (typeof err === 'string') return { message: err, stack: null }
  try {
    return { message: JSON.stringify(err), stack: null }
  } catch {
    return { message: String(err), stack: null }
  }
}

export function reportError(err: unknown, context?: string): void {
  const { message, stack } = describeError(err)
  if (!message || IGNORED.some((re) => re.test(message))) return
  const key = message.slice(0, 200)
  if (seen.has(key) || seen.size >= MAX_PER_PAGE) return
  seen.add(key)
  void supabase
    .rpc('log_client_error', {
      p_message: context ? `${message} [${context}]` : message,
      p_stack: stack ?? undefined,
      p_url: location.href.slice(0, 500),
      p_user_agent: navigator.userAgent.slice(0, 300),
      p_session_id: sessionId(),
      p_release: __APP_RELEASE__,
    })
    .then(
      () => undefined,
      () => undefined, // reporting must never throw
    )
}

/** A deploy replaced the code chunks this tab expected: reload once to get the new ones. */
function isStaleChunk(err: unknown): boolean {
  const { message } = describeError(err)
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message)
}

export function installErrorReporter(app: App, router: Router): void {
  router.onError((err, to) => {
    if (isStaleChunk(err)) {
      try {
        if (!sessionStorage.getItem('hal:reloaded-for-deploy')) {
          sessionStorage.setItem('hal:reloaded-for-deploy', '1')
          location.assign(to.fullPath)
          return
        }
      } catch {
        // storage blocked: fall through and report
      }
    }
    reportError(err, 'router')
  })

  if (import.meta.env.DEV || import.meta.env.MODE === 'test') return

  app.config.errorHandler = (err, _instance, info) => {
    console.error(err)
    reportError(err, info)
  }
  window.addEventListener('error', (e) => reportError(e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'promise'))
}

/** Only same-site paths are allowed as a post-login target (no open redirects). */
export function safeNext(value: unknown, fallback = '/profile'): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback
}

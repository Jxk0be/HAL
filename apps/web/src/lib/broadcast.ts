/** Stream links: https on Twitch, YouTube or Kick. Mirrors public.is_stream_url(). */
const STREAM_HOSTS = ['twitch.tv', 'youtube.com', 'youtu.be', 'kick.com']

export function isStreamUrl(raw: string): boolean {
  const s = raw.trim()
  if (!s || s.length > 300) return false
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  return STREAM_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
}

/** "Twitch", "YouTube" or "Kick" for button labels. */
export function streamPlatform(raw: string | null | undefined): string {
  if (!raw) return 'stream'
  try {
    const host = new URL(raw).hostname.toLowerCase()
    if (host.endsWith('twitch.tv')) return 'Twitch'
    if (host.endsWith('youtube.com') || host.endsWith('youtu.be')) return 'YouTube'
    if (host.endsWith('kick.com')) return 'Kick'
  } catch {
    // fall through
  }
  return 'stream'
}

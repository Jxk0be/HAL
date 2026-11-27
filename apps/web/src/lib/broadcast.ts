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

export interface StreamEmbed {
  /** Player iframe src. */
  src: string
  /** Twitch live chat iframe src (live channels only). */
  chatSrc: string | null
  platform: 'Twitch' | 'YouTube' | 'Kick'
}

const YT_ID = /^[A-Za-z0-9_-]{6,20}$/
const TWITCH_NAME = /^[A-Za-z0-9_]{3,25}$/
const KICK_NAME = /^[A-Za-z0-9_-]{3,25}$/

/**
 * The embeddable player for a stream or replay link, or null when the link can't be embedded (a
 * YouTube channel page, say): show a plain "Watch on …" link then. Twitch requires the site's own
 * hostname as `parent`. Hosts here must be allowed in netlify.toml's frame-src.
 */
export function streamEmbed(raw: string | null | undefined, parentHost: string): StreamEmbed | null {
  if (!raw || !isStreamUrl(raw)) return null
  const url = new URL(raw.trim())
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '')
  const parts = url.pathname.split('/').filter(Boolean)
  const parent = encodeURIComponent(parentHost)

  if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) {
    if (parts[0] === 'videos' && /^\d+$/.test(parts[1] ?? '')) {
      return { platform: 'Twitch', src: `https://player.twitch.tv/?video=v${parts[1]}&parent=${parent}&autoplay=false`, chatSrc: null }
    }
    const channel = parts[0]
    if (channel && TWITCH_NAME.test(channel) && parts.length === 1) {
      return {
        platform: 'Twitch',
        src: `https://player.twitch.tv/?channel=${channel}&parent=${parent}`,
        chatSrc: `https://www.twitch.tv/embed/${channel}/chat?parent=${parent}&darkpopout`,
      }
    }
    return null
  }

  if (host === 'youtu.be') {
    const id = parts[0]
    return id && YT_ID.test(id) ? { platform: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${id}`, chatSrc: null } : null
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    const id = url.searchParams.get('v') ?? (['live', 'embed', 'shorts'].includes(parts[0] ?? '') ? parts[1] : null)
    return id && YT_ID.test(id) ? { platform: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${id}`, chatSrc: null } : null
  }

  if (host === 'kick.com') {
    const channel = parts[0]
    if (channel && KICK_NAME.test(channel) && parts.length === 1) {
      return { platform: 'Kick', src: `https://player.kick.com/${channel}`, chatSrc: null }
    }
    return null
  }
  return null
}

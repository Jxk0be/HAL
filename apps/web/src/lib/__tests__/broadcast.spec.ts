import { describe, expect, it } from 'vitest'
import { isStreamUrl, streamEmbed, streamPlatform } from '../broadcast'

describe('isStreamUrl', () => {
  it('accepts https Twitch, YouTube and Kick links', () => {
    for (const u of ['https://www.twitch.tv/hal', 'https://twitch.tv/hal', 'https://youtube.com/live/abc', 'https://www.youtube.com/watch?v=x', 'https://youtu.be/x', 'https://kick.com/hal', 'https://m.twitch.tv/hal']) {
      expect(isStreamUrl(u), u).toBe(true)
    }
  })
  it('rejects http, other hosts and look-alikes', () => {
    for (const u of ['http://twitch.tv/hal', 'https://evil.example/twitch.tv', 'https://twitch.tv.evil.com/x', 'https://nottwitch.tv/x', 'twitch.tv/hal', '']) {
      expect(isStreamUrl(u), u).toBe(false)
    }
  })
  it('names the platform', () => {
    expect(streamPlatform('https://www.twitch.tv/hal')).toBe('Twitch')
    expect(streamPlatform('https://youtu.be/x')).toBe('YouTube')
    expect(streamPlatform(null)).toBe('stream')
  })
})

describe('streamEmbed', () => {
  const host = 'bil.example'
  it('embeds a live Twitch channel with chat', () => {
    expect(streamEmbed('https://www.twitch.tv/BIL_Casts', host)).toEqual({
      platform: 'Twitch',
      src: 'https://player.twitch.tv/?channel=BIL_Casts&parent=bil.example',
      chatSrc: 'https://www.twitch.tv/embed/BIL_Casts/chat?parent=bil.example&darkpopout',
    })
  })
  it('embeds Twitch VODs without chat', () => {
    expect(streamEmbed('https://www.twitch.tv/videos/123456789', host)?.src).toBe(
      'https://player.twitch.tv/?video=v123456789&parent=bil.example&autoplay=false',
    )
  })
  it('embeds YouTube videos and live links through youtube-nocookie', () => {
    for (const u of ['https://www.youtube.com/watch?v=abcDEF12345', 'https://youtu.be/abcDEF12345', 'https://youtube.com/live/abcDEF12345']) {
      expect(streamEmbed(u, host)?.src, u).toBe('https://www.youtube-nocookie.com/embed/abcDEF12345')
    }
  })
  it('embeds Kick channels', () => {
    expect(streamEmbed('https://kick.com/bilcasts', host)?.src).toBe('https://player.kick.com/bilcasts')
  })
  it('returns null for links it cannot embed', () => {
    for (const u of ['https://www.youtube.com/@bil/live', 'https://www.twitch.tv/bil/clip/x', 'http://twitch.tv/bil', 'https://evil.example/x', null]) {
      expect(streamEmbed(u, host), String(u)).toBeNull()
    }
  })
})

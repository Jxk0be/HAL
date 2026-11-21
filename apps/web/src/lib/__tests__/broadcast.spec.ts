import { describe, expect, it } from 'vitest'
import { isStreamUrl, streamPlatform } from '../broadcast'

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

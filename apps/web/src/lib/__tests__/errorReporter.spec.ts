import { describe, expect, it, vi } from 'vitest'

// The real client throws without VITE_SUPABASE_* env vars (as in CI).
vi.mock('../supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { describeError } from '../errorReporter'

describe('describeError', () => {
  it('names errors, keeps strings and serialises the rest', () => {
    expect(describeError(new TypeError('x is undefined')).message).toBe('TypeError: x is undefined')
    expect(describeError('boom')).toEqual({ message: 'boom', stack: null })
    expect(describeError({ code: 42 }).message).toBe('{"code":42}')
  })
})

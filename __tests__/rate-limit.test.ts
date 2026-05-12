import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRedis } = vi.hoisted(() => ({
  mockRedis: {
    get:    vi.fn(),
    incr:   vi.fn(),
    expire: vi.fn(),
    del:    vi.fn(),
    ttl:    vi.fn(),
  },
}))

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(function () { return mockRedis }),
}))

import { checkLoginRateLimit, incrementLoginAttempts, clearLoginRateLimit } from '@/lib/rate-limit'

describe('checkLoginRateLimit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows when no record exists for the IP', async () => {
    mockRedis.get.mockResolvedValue(null)

    const result = await checkLoginRateLimit('1.2.3.4')

    expect(result.allowed).toBe(true)
    expect(result.retryAfterMinutes).toBeUndefined()
  })

  it('allows when attempts are below the limit', async () => {
    mockRedis.get.mockResolvedValue(5)

    const result = await checkLoginRateLimit('1.2.3.4')

    expect(result.allowed).toBe(true)
  })

  it('allows on exactly one below the limit (9th attempt)', async () => {
    mockRedis.get.mockResolvedValue(9)

    const result = await checkLoginRateLimit('1.2.3.4')

    expect(result.allowed).toBe(true)
  })

  it('blocks when attempts reach the limit', async () => {
    mockRedis.get.mockResolvedValue(10)
    mockRedis.ttl.mockResolvedValue(780) // 13 minutes left

    const result = await checkLoginRateLimit('1.2.3.4')

    expect(result.allowed).toBe(false)
    expect(result.retryAfterMinutes).toBe(13)
  })

  it('blocks on any count above the limit', async () => {
    mockRedis.get.mockResolvedValue(99)
    mockRedis.ttl.mockResolvedValue(780)

    const result = await checkLoginRateLimit('1.2.3.4')

    expect(result.allowed).toBe(false)
  })

  it('passes the IP to the Redis key', async () => {
    mockRedis.get.mockResolvedValue(null)

    await checkLoginRateLimit('10.0.0.1')

    expect(mockRedis.get.mock.calls[0][0]).toContain('10.0.0.1')
  })

  it('returns at least 1 minute when TTL is nearly expired', async () => {
    mockRedis.get.mockResolvedValue(10)
    mockRedis.ttl.mockResolvedValue(30) // 30 seconds left

    const result = await checkLoginRateLimit('1.2.3.4')

    expect(result.retryAfterMinutes).toBe(1)
  })
})

describe('incrementLoginAttempts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('increments the counter for the given IP', async () => {
    mockRedis.incr.mockResolvedValue(2)

    await incrementLoginAttempts('1.2.3.4')

    expect(mockRedis.incr).toHaveBeenCalledOnce()
    expect(mockRedis.incr.mock.calls[0][0]).toContain('1.2.3.4')
  })

  it('sets TTL on the first failure', async () => {
    mockRedis.incr.mockResolvedValue(1)

    await incrementLoginAttempts('1.2.3.4')

    expect(mockRedis.expire).toHaveBeenCalledOnce()
  })

  it('does not reset TTL on subsequent failures', async () => {
    mockRedis.incr.mockResolvedValue(3)

    await incrementLoginAttempts('1.2.3.4')

    expect(mockRedis.expire).not.toHaveBeenCalled()
  })
})

describe('clearLoginRateLimit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the key for the given IP', async () => {
    mockRedis.del.mockResolvedValue(1)

    await clearLoginRateLimit('1.2.3.4')

    expect(mockRedis.del).toHaveBeenCalledOnce()
    expect(mockRedis.del.mock.calls[0][0]).toContain('1.2.3.4')
  })
})

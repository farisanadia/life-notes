import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session } from 'next-auth'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/session-blocklist', () => ({ isSessionRevoked: vi.fn() }))

import { requireAuth, requireAuthStrict, requireAdmin, requireAdminAuth } from '@/lib/auth-guard'
import { auth } from '@/lib/auth'
import { isSessionRevoked } from '@/lib/session-blocklist'

// auth() is overloaded in NextAuth v5; when called with no args it resolves to
// Session | null — cast to that signature so the mock types correctly.
const mockAuth             = vi.mocked(auth as unknown as () => Promise<Session | null>)
const mockIsSessionRevoked = vi.mocked(isSessionRevoked)

const validSession = {
  user: { id: 'admin', jti: 'test-jti-123', name: 'farisa', email: '' },
  expires: '',
}

// ── requireAuth (fast, no Redis) ──────────────────────────────────────────────

describe('requireAuth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the userId when session is valid', async () => {
    mockAuth.mockResolvedValue(validSession)
    expect(await requireAuth()).toBe('admin')
  })

  it('throws when there is no session', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(requireAuth()).rejects.toThrow('Unauthorized')
  })

  it('throws when session has no user id', async () => {
    mockAuth.mockResolvedValue({
      // @ts-expect-error — malformed session
      user: { jti: 'test-jti-123' },
      expires: '',
    })
    await expect(requireAuth()).rejects.toThrow('Unauthorized')
  })

  it('throws when session has no jti', async () => {
    mockAuth.mockResolvedValue({
      // @ts-expect-error — malformed session
      user: { id: 'admin' },
      expires: '',
    })
    await expect(requireAuth()).rejects.toThrow('Unauthorized')
  })

  it('does NOT check the session revocation list', async () => {
    mockAuth.mockResolvedValue(validSession)
    await requireAuth()
    expect(mockIsSessionRevoked).not.toHaveBeenCalled()
  })
})

// ── requireAuthStrict (full check including Redis) ────────────────────────────

describe('requireAuthStrict', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSessionRevoked.mockResolvedValue(false)
  })

  it('returns the userId when session is valid and not revoked', async () => {
    mockAuth.mockResolvedValue(validSession)
    expect(await requireAuthStrict()).toBe('admin')
  })

  it('throws when there is no session', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(requireAuthStrict()).rejects.toThrow('Unauthorized')
  })

  it('throws when session has no jti', async () => {
    mockAuth.mockResolvedValue({
      // @ts-expect-error — malformed session
      user: { id: 'admin' },
      expires: '',
    })
    await expect(requireAuthStrict()).rejects.toThrow('Unauthorized')
  })

  it('throws when the session has been revoked', async () => {
    mockAuth.mockResolvedValue(validSession)
    mockIsSessionRevoked.mockResolvedValue(true)
    await expect(requireAuthStrict()).rejects.toThrow('Unauthorized')
  })

  it('checks the revocation list', async () => {
    mockAuth.mockResolvedValue(validSession)
    await requireAuthStrict()
    expect(mockIsSessionRevoked).toHaveBeenCalledOnce()
  })
})

const nonAdminSession = {
  user: { id: 'user-uuid-123', jti: 'test-jti-456', name: 'alice', email: '' },
  expires: '',
}

// ── requireAdminAuth (fast page check) ────────────────────────────────────────

describe('requireAdminAuth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the userId when the admin is signed in', async () => {
    mockAuth.mockResolvedValue(validSession)
    expect(await requireAdminAuth()).toBe('admin')
  })

  it('throws Unauthorized when no session', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(requireAdminAuth()).rejects.toThrow('Unauthorized')
  })

  it('throws Forbidden when a non-admin is signed in', async () => {
    mockAuth.mockResolvedValue(nonAdminSession)
    await expect(requireAdminAuth()).rejects.toThrow('Forbidden')
  })

  it('does NOT check the revocation list', async () => {
    mockAuth.mockResolvedValue(validSession)
    await requireAdminAuth()
    expect(mockIsSessionRevoked).not.toHaveBeenCalled()
  })
})

// ── requireAdmin (strict server-action check) ─────────────────────────────────

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSessionRevoked.mockResolvedValue(false)
  })

  it('returns the userId when the admin is signed in and not revoked', async () => {
    mockAuth.mockResolvedValue(validSession)
    expect(await requireAdmin()).toBe('admin')
  })

  it('throws Forbidden when a non-admin is signed in', async () => {
    mockAuth.mockResolvedValue(nonAdminSession)
    await expect(requireAdmin()).rejects.toThrow('Forbidden')
  })

  it('throws Unauthorized when the admin session was revoked', async () => {
    mockAuth.mockResolvedValue(validSession)
    mockIsSessionRevoked.mockResolvedValue(true)
    await expect(requireAdmin()).rejects.toThrow('Unauthorized')
  })

  it('checks the revocation list', async () => {
    mockAuth.mockResolvedValue(validSession)
    await requireAdmin()
    expect(mockIsSessionRevoked).toHaveBeenCalledOnce()
  })
})

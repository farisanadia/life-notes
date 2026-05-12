import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/session-blocklist', () => ({ isSessionRevoked: vi.fn() }))

import { requireAuth } from '@/lib/auth-guard'
import { auth } from '@/lib/auth'
import { isSessionRevoked } from '@/lib/session-blocklist'

const mockAuth             = vi.mocked(auth)
const mockIsSessionRevoked = vi.mocked(isSessionRevoked)

const validSession = {
  user: { id: 'admin', jti: 'test-jti-123', name: 'farisa', email: '' },
  expires: '',
}

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSessionRevoked.mockResolvedValue(false)
  })

  it('returns the userId when session is valid', async () => {
    mockAuth.mockResolvedValue(validSession)

    const userId = await requireAuth()

    expect(userId).toBe('admin')
  })

  it('throws when there is no session', async () => {
    mockAuth.mockResolvedValue(null)

    await expect(requireAuth()).rejects.toThrow('Unauthorized')
  })

  it('throws when session has no user id', async () => {
    mockAuth.mockResolvedValue({
      // @ts-expect-error — simulating a malformed session
      user: { jti: 'test-jti-123', name: 'farisa' },
      expires: '',
    })

    await expect(requireAuth()).rejects.toThrow('Unauthorized')
  })

  it('throws when session has no jti', async () => {
    mockAuth.mockResolvedValue({
      // @ts-expect-error — simulating a malformed session
      user: { id: 'admin', name: 'farisa' },
      expires: '',
    })

    await expect(requireAuth()).rejects.toThrow('Unauthorized')
  })

  it('throws when session user object is missing entirely', async () => {
    mockAuth.mockResolvedValue({
      // @ts-expect-error — simulating a malformed session
      user: null,
      expires: '',
    })

    await expect(requireAuth()).rejects.toThrow('Unauthorized')
  })

  it('throws when the session has been revoked', async () => {
    mockAuth.mockResolvedValue(validSession)
    mockIsSessionRevoked.mockResolvedValue(true)

    await expect(requireAuth()).rejects.toThrow('Unauthorized')
  })

  it('does not throw when session is valid and not revoked', async () => {
    mockAuth.mockResolvedValue(validSession)
    mockIsSessionRevoked.mockResolvedValue(false)

    await expect(requireAuth()).resolves.toBe('admin')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { AuthError, CredentialsSignin } = vi.hoisted(() => {
  class AuthError extends Error { name = 'AuthError' }
  class CredentialsSignin extends AuthError { name = 'CredentialsSignin' }
  return { AuthError, CredentialsSignin }
})

vi.mock('next-auth', () => ({ AuthError, CredentialsSignin }))
vi.mock('@/lib/auth', () => ({ signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkLoginRateLimit:   vi.fn(),
  incrementLoginAttempts: vi.fn(),
  clearLoginRateLimit:   vi.fn(),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => (key === 'x-forwarded-for' ? '1.2.3.4' : null),
  }),
}))

import { loginAction } from '@/lib/actions/auth'
import { signIn } from '@/lib/auth'
import { checkLoginRateLimit, incrementLoginAttempts, clearLoginRateLimit } from '@/lib/rate-limit'

const mockSignIn            = vi.mocked(signIn)
const mockCheckRateLimit    = vi.mocked(checkLoginRateLimit)
const mockIncrementAttempts = vi.mocked(incrementLoginAttempts)
const mockClearRateLimit    = vi.mocked(clearLoginRateLimit)

function makeFormData(username: string, password: string): FormData {
  const fd = new FormData()
  fd.append('username', username)
  fd.append('password', password)
  return fd
}

describe('loginAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckRateLimit.mockResolvedValue({ allowed: true })
    mockSignIn.mockResolvedValue(undefined as never)
    mockIncrementAttempts.mockResolvedValue(undefined)
    mockClearRateLimit.mockResolvedValue(undefined)
  })

  // ── Rate limiting ──────────────────────────────────────────────────────────

  it('blocks when the IP is rate-limited, without calling signIn', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfterMinutes: 15 })

    const result = await loginAction(undefined, makeFormData('farisa', 'wrong'))

    expect(result?.error).toMatch(/too many/i)
    expect(result?.error).toContain('15 minutes')
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('preserves the username when rate-limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfterMinutes: 15 })

    const result = await loginAction(undefined, makeFormData('farisa', 'wrong'))

    expect(result?.username).toBe('farisa')
  })

  it('checks the rate limit before calling signIn', async () => {
    await loginAction(undefined, makeFormData('farisa', 'pass'))

    const checkOrder  = mockCheckRateLimit.mock.invocationCallOrder[0]
    const signInOrder = mockSignIn.mock.invocationCallOrder[0]
    expect(checkOrder).toBeLessThan(signInOrder)
  })

  // ── Failed credentials ─────────────────────────────────────────────────────

  it('returns a credentials error when signIn throws AuthError', async () => {
    mockSignIn.mockRejectedValue(new CredentialsSignin('bad credentials'))

    const result = await loginAction(undefined, makeFormData('farisa', 'badpass'))

    expect(result?.error).toMatch(/invalid username or password/i)
    expect(result?.username).toBe('farisa')
  })

  it('increments the attempt counter on failed credentials', async () => {
    mockSignIn.mockRejectedValue(new CredentialsSignin('bad credentials'))

    await loginAction(undefined, makeFormData('farisa', 'badpass'))

    expect(mockIncrementAttempts).toHaveBeenCalledOnce()
    expect(mockIncrementAttempts).toHaveBeenCalledWith('1.2.3.4')
  })

  it('does NOT clear the rate limit on failed credentials', async () => {
    mockSignIn.mockRejectedValue(new CredentialsSignin('bad credentials'))

    await loginAction(undefined, makeFormData('farisa', 'badpass'))

    expect(mockClearRateLimit).not.toHaveBeenCalled()
  })

  // ── Successful login ───────────────────────────────────────────────────────

  it('clears the rate limit counter on successful login (NEXT_REDIRECT path)', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT' })
    mockSignIn.mockRejectedValue(redirect)

    await expect(loginAction(undefined, makeFormData('farisa', 'correctpass')))
      .rejects.toThrow('NEXT_REDIRECT')

    expect(mockClearRateLimit).toHaveBeenCalledWith('1.2.3.4')
  })

  it('does NOT increment attempts on successful login', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT' })
    mockSignIn.mockRejectedValue(redirect)

    await expect(loginAction(undefined, makeFormData('farisa', 'correctpass')))
      .rejects.toThrow('NEXT_REDIRECT')

    expect(mockIncrementAttempts).not.toHaveBeenCalled()
  })

  it('re-throws NEXT_REDIRECT so Next.js can perform the redirect', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT' })
    mockSignIn.mockRejectedValue(redirect)

    await expect(
      loginAction(undefined, makeFormData('farisa', 'pass'))
    ).rejects.toThrow('NEXT_REDIRECT')
  })

  // ── Payload ────────────────────────────────────────────────────────────────

  it('calls signIn with the correct credentials and redirect', async () => {
    await loginAction(undefined, makeFormData('farisa', 'mypassword'))

    expect(mockSignIn).toHaveBeenCalledWith('credentials', {
      username:   'farisa',
      password:   'mypassword',
      redirectTo: '/notes',
    })
  })
})

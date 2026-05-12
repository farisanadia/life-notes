'use server'

import { signIn, signOut, auth } from '@/lib/auth'
import { AuthError } from 'next-auth'
import { headers } from 'next/headers'
import {
  checkLoginRateLimit,
  incrementLoginAttempts,
  clearLoginRateLimit,
} from '@/lib/rate-limit'
import { revokeSession } from '@/lib/session-blocklist'

type LoginState = { error: string; username: string } | undefined

function getClientIp(headersList: Awaited<ReturnType<typeof headers>>): string {
  return (
    headersList.get('x-forwarded-for')?.split(',')[0].trim() ??
    headersList.get('x-real-ip') ??
    'unknown'
  )
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = formData.get('username') as string
  const password = formData.get('password') as string

  const headersList = await headers()
  const ip = getClientIp(headersList)

  // Check current counter — does not increment
  const { allowed, retryAfterMinutes } = await checkLoginRateLimit(ip)
  if (!allowed) {
    const unit = retryAfterMinutes === 1 ? 'minute' : 'minutes'
    return {
      error: `Too many failed attempts. Try again in ${retryAfterMinutes} ${unit}.`,
      username,
    }
  }

  try {
    await signIn('credentials', { username, password, redirectTo: '/notes' })
  } catch (error) {
    if (error instanceof AuthError) {
      // Wrong credentials — increment the failure counter
      await incrementLoginAttempts(ip)
      return { error: 'Invalid username or password.', username }
    }
    // NEXT_REDIRECT thrown by signIn on success — clear the counter, then
    // re-throw so Next.js performs the redirect
    await clearLoginRateLimit(ip)
    throw error
  }
}

export async function signOutAction() {
  const session = await auth()
  console.log('[signOutAction] session:', JSON.stringify(session, null, 2))
  if (session?.user?.jti) {
    console.log('[signOutAction] revoking jti:', session.user.jti)
    await revokeSession(session.user.jti)
    console.log('[signOutAction] revoked ok')
  } else {
    console.log('[signOutAction] no jti found — skipping revocation')
  }
  await signOut({ redirectTo: '/login' })
}

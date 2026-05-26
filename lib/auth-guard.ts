import { auth } from './auth'
import { isSessionRevoked } from './session-blocklist'

// The single env-seeded admin always has id='admin'. Other accounts get UUIDs.
export const ADMIN_USER_ID = 'admin'

/**
 * Fast check for page renders — decodes the JWT locally, no network call.
 * Use this in Server Components and page data fetches.
 */
export async function requireAuth(): Promise<string> {
  const session = await auth()
  const userId  = session?.user?.id
  const jti     = session?.user?.jti
  if (!userId || !jti) throw new Error('Unauthorized')
  return userId
}

/**
 * Strict check for mutations — decodes the JWT and verifies the token
 * hasn't been revoked in Redis. Use this in all Server Actions.
 */
export async function requireAuthStrict(): Promise<string> {
  const session = await auth()
  const userId  = session?.user?.id
  const jti     = session?.user?.jti
  if (!userId || !jti) throw new Error('Unauthorized')
  if (await isSessionRevoked(jti)) throw new Error('Unauthorized')
  return userId
}

/**
 * Fast admin check for page renders. Throws Unauthorized for guests and
 * Forbidden for signed-in non-admins.
 */
export async function requireAdminAuth(): Promise<string> {
  const userId = await requireAuth()
  if (userId !== ADMIN_USER_ID) throw new Error('Forbidden')
  return userId
}

/**
 * Strict admin check for server actions (JWT + Redis revocation + admin role).
 */
export async function requireAdmin(): Promise<string> {
  const userId = await requireAuthStrict()
  if (userId !== ADMIN_USER_ID) throw new Error('Forbidden')
  return userId
}

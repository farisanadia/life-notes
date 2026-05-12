import { auth } from './auth'
import { isSessionRevoked } from './session-blocklist'

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

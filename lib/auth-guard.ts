import { auth } from './auth'
import { isSessionRevoked } from './session-blocklist'

/**
 * Use at the top of every Server Action.
 * Returns the userId so queries can be scoped to the right user.
 * Throws if the session is missing, revoked, or invalid.
 */
export async function requireAuth(): Promise<string> {
  const session = await auth()
  const userId = session?.user?.id
  const jti    = session?.user?.jti
  console.log('[requireAuth] userId:', userId, 'jti:', jti)
  if (!userId || !jti) throw new Error('Unauthorized')
  const revoked = await isSessionRevoked(jti)
  console.log('[requireAuth] isRevoked:', revoked)
  if (revoked) throw new Error('Unauthorized')
  return userId
}

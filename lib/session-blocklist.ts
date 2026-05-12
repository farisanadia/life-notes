import { redis } from './redis'
import { SESSION_MAX_AGE } from './auth'

function key(jti: string) {
  return `revoked_session:${jti}`
}

/** Add a token to the blocklist. TTL matches the session max age so the key auto-expires. */
export async function revokeSession(jti: string): Promise<void> {
  await redis.set(key(jti), 1, { ex: SESSION_MAX_AGE })
}

/** Returns true if the token has been revoked. */
export async function isSessionRevoked(jti: string): Promise<boolean> {
  const val = await redis.get(key(jti))
  return val !== null
}

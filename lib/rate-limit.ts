import { redis } from './redis'

const MAX_ATTEMPTS    = 10
const WINDOW_SECONDS  = 15 * 60  // 15 minutes

function key(ip: string) {
  return `login_attempts:${ip}`
}

/** Read-only check — does NOT increment the counter. */
export async function checkLoginRateLimit(
  ip: string,
): Promise<{ allowed: boolean; retryAfterMinutes?: number }> {
  const attempts = await redis.get<number>(key(ip))

  if (!attempts || attempts < MAX_ATTEMPTS) return { allowed: true }

  const ttl = await redis.ttl(key(ip))
  const retryAfterMinutes = Math.max(1, Math.ceil(ttl / 60))
  return { allowed: false, retryAfterMinutes }
}

/** Call this only on a failed login attempt. */
export async function incrementLoginAttempts(ip: string): Promise<void> {
  const k = key(ip)
  const current = await redis.incr(k)
  if (current === 1) {
    // First failure — set the window TTL
    await redis.expire(k, WINDOW_SECONDS)
  }
}

/** Call this on a successful login to reset the counter for this IP. */
export async function clearLoginRateLimit(ip: string): Promise<void> {
  await redis.del(key(ip))
}

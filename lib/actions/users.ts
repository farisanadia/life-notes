'use server'

import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { ADMIN_USER_ID, requireAdmin } from '@/lib/auth-guard'
import { db } from '@/lib/db/index'
import { users, notes, folders, tags, vaultEntries } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const USERNAME_REGEX = /^[a-z0-9_-]+$/

// Postgres unique-violation SQLSTATE.
const UNIQUE_VIOLATION = '23505'

export type CreateUserState =
  | { error: string; username: string }
  | { success: string }
  | undefined

/**
 * Admin-only: create a new user account.
 * Username is normalised to lowercase. Password is bcrypt-hashed (cost 12).
 */
export async function createUserAction(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  await requireAdmin()

  const rawUsername = String(formData.get('username') ?? '').trim()
  const password    = String(formData.get('password') ?? '')
  const username    = rawUsername.toLowerCase()

  if (username.length < 3 || username.length > 32) {
    return { error: 'Username must be 3–32 characters.', username: rawUsername }
  }
  if (!USERNAME_REGEX.test(username)) {
    return {
      error: 'Username may only contain letters, numbers, dashes, and underscores.',
      username: rawUsername,
    }
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.', username: rawUsername }
  }
  // Reserve the env-admin username so a UI-created account can't shadow it.
  const envAdmin = process.env.ADMIN_USERNAME?.trim().toLowerCase()
  if (envAdmin && username === envAdmin) {
    return { error: 'That username is reserved.', username: rawUsername }
  }

  const passwordHash = await bcrypt.hash(password, 12)

  try {
    await db.insert(users).values({ username, passwordHash })
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === UNIQUE_VIOLATION) {
      return { error: 'That username is already taken.', username: rawUsername }
    }
    throw err
  }

  revalidatePath('/settings/users')
  return { success: `Created account "${username}".` }
}

/**
 * Admin-only: list all accounts (omits password hashes).
 */
export async function listUsers() {
  await requireAdmin()
  return db
    .select({
      id:        users.id,
      username:  users.username,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt)
}

/**
 * Admin-only: delete a user account and all their data. Cannot target the
 * admin user itself.
 *
 * The user-scoped tables don't have FKs to `users` (intentional — userId is
 * plain text), so we delete each one explicitly. Order doesn't matter for
 * correctness because each table is scoped by `user_id`; note_tags rows hang
 * off notes/tags via cascade.
 *
 * Note: their existing JWT keeps decoding until expiry (max 7d), but every
 * data query is scoped by userId so the deleted account sees no data. A future
 * hardening would track active sessions per user and revoke them here.
 */
export async function deleteUserAction(id: string) {
  await requireAdmin()
  if (id === ADMIN_USER_ID) {
    throw new Error('The admin account cannot be deleted.')
  }
  await db.delete(notes).where(eq(notes.userId, id))
  await db.delete(tags).where(eq(tags.userId, id))
  await db.delete(folders).where(eq(folders.userId, id))
  await db.delete(vaultEntries).where(eq(vaultEntries.userId, id))
  await db.delete(users).where(eq(users.id, id))
  revalidatePath('/settings/users')
}

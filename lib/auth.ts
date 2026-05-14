import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/index'
import { users } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import { ADMIN_USER_ID } from '@/lib/auth-guard'

export const SESSION_MAX_AGE = 7 * 24 * 60 * 60 // 7 days in seconds

// Authenticate the env-seeded admin and ensure its row exists in `users`.
// Returns the admin user object if credentials match, null otherwise.
async function authorizeAdmin(
  username: string,
  password: string,
): Promise<{ id: string; name: string } | null> {
  const expectedUsername = process.env.ADMIN_USERNAME?.trim()
  const hashB64 = process.env.ADMIN_PASSWORD_HASH_B64?.trim()
  if (!expectedUsername || !hashB64) return null
  if (username !== expectedUsername) return null

  const hash = Buffer.from(hashB64, 'base64').toString('utf8')
  if (!(await bcrypt.compare(password, hash))) return null

  // Make sure the admin row exists so the user list shows it consistently.
  // The stored hash is opaque — env is the source of truth for admin auth.
  await db
    .insert(users)
    .values({ id: ADMIN_USER_ID, username, passwordHash: 'env-managed' })
    .onConflictDoNothing({ target: users.id })

  return { id: ADMIN_USER_ID, name: username }
}

// Authenticate a non-admin user against the `users` table.
async function authorizeUser(
  username: string,
  password: string,
): Promise<{ id: string; name: string } | null> {
  const lowered = username.toLowerCase()
  const [row] = await db
    .select({ id: users.id, username: users.username, hash: users.passwordHash })
    .from(users)
    // Skip the admin row: that account is authenticated via the env vars only.
    .where(sql`${users.username} = ${lowered} AND ${users.id} != ${ADMIN_USER_ID}`)
    .limit(1)

  if (!row) return null
  if (!(await bcrypt.compare(password, row.hash))) return null

  return { id: row.id, name: row.username }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: {},
        password: {},
      },
      async authorize(credentials) {
        const username = credentials?.username as string | undefined
        const password = credentials?.password as string | undefined
        if (!username || !password) return null

        const trimmed = username.trim()

        // Try the env admin first. If it doesn't match, fall through to DB users.
        const admin = await authorizeAdmin(trimmed, password)
        if (admin) return admin

        return await authorizeUser(trimmed, password)
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE,
  },
  callbacks: {
    // Persist user.id and a unique token ID (jti) into the JWT
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id
      if (!token.jti) token.jti = crypto.randomUUID()
      return token
    },
    // Expose user.id on the session object returned by auth()
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      if (token.jti) session.user.jti = token.jti as string
      return session
    },
  },
  pages: { signIn: '/login' },
})


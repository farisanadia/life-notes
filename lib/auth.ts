import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'

export const SESSION_MAX_AGE = 7 * 24 * 60 * 60 // 7 days in seconds

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

        const expectedUsername = process.env.ADMIN_USERNAME?.trim()
        const hashB64 = process.env.ADMIN_PASSWORD_HASH_B64?.trim()

        if (!username || !password) return null
        if (username !== expectedUsername) return null
        if (!hashB64) return null

        const hash = Buffer.from(hashB64, 'base64').toString('utf8')
        const valid = await bcrypt.compare(password, hash)
        if (!valid) return null

        return { id: 'admin', name: username }
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

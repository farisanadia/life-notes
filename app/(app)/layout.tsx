import { ADMIN_USER_ID, requireAuth } from '@/lib/auth-guard'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db/index'
import { folders, tags, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Sidebar } from '@/components/Sidebar'
import { AppHeader } from '@/components/AppHeader'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const userId = await requireAuth()
  const session = await auth()

  const [userFolders, userTags, userRow] = await Promise.all([
    db.select().from(folders).where(eq(folders.userId, userId)),
    db.select().from(tags).where(eq(tags.userId, userId)),
    db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  ])

  const userName = session?.user?.name ?? userRow[0]?.username ?? 'You'

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <AppHeader userName={userName} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          folders={userFolders}
          tags={userTags}
          isAdmin={userId === ADMIN_USER_ID}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}

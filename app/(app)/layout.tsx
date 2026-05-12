import { requireAuth } from '@/lib/auth-guard'
import { db } from '@/lib/db/index'
import { folders, tags } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Sidebar } from '@/components/Sidebar'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const userId = await requireAuth()

  const [userFolders, userTags] = await Promise.all([
    db.select().from(folders).where(eq(folders.userId, userId)),
    db.select().from(tags).where(eq(tags.userId, userId)),
  ])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar folders={userFolders} tags={userTags} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}

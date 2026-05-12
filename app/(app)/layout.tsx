import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db/index'
import { folders, tags } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Sidebar } from '@/components/Sidebar'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

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

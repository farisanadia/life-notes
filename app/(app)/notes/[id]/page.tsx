import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth-guard'
import { db } from '@/lib/db/index'
import { notes } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { BackButton } from '@/components/notes/BackButton'

type Props = { params: Promise<{ id: string }> }

export default async function NotePage({ params }: Props) {
  const userId = await requireAuth()
  const { id } = await params

  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  if (!note || note.isTrashed) notFound()

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-4 py-2 border-b border-border">
        <BackButton />
      </div>
      <div className="min-h-0 flex-1">
        <NoteEditor note={note} />
      </div>
    </div>
  )
}

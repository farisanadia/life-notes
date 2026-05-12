import { notFound, redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-guard'
import { db } from '@/lib/db/index'
import { notes } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { trashNote } from '@/lib/actions/notes'

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
      {/* Note toolbar */}
      <div className="flex items-center justify-end px-4 py-2 border-b border-border gap-2">
        <form
          action={async () => {
            'use server'
            await trashNote(id)
            redirect('/notes')
          }}
        >
          <button
            type="submit"
            className="text-xs text-muted-fg hover:text-foreground px-2 py-1 rounded hover:bg-surface-hover transition-colors"
          >
            Move to trash
          </button>
        </form>
      </div>

      <NoteEditor note={note} />
    </div>
  )
}

import { requireAuth } from '@/lib/auth-guard'
import { db } from '@/lib/db/index'
import { NotesCanvas } from '@/components/notes/NotesCanvas'

export default async function NotesPage() {
  const userId = await requireAuth()

  const rows = await db.query.notes.findMany({
    where: (notes, { eq, and }) =>
      and(eq(notes.userId, userId), eq(notes.isTrashed, false)),
    with: {
      noteTags: { with: { tag: true } },
    },
  })

  const notes = rows.map(({ noteTags, ...note }) => ({
    ...note,
    tags: noteTags.map(nt => nt.tag),
  }))

  return <NotesCanvas notes={notes} />
}

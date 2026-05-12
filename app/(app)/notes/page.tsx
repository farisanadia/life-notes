import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-guard'
import { db } from '@/lib/db/index'
import { notes } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { createNote } from '@/lib/actions/notes'

export default async function NotesPage() {
  const userId = await requireAuth()

  const allNotes = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.isTrashed, false)))
    .orderBy(desc(notes.isPinned), desc(notes.updatedAt))

  const pinned   = allNotes.filter(n => n.isPinned)
  const unpinned = allNotes.filter(n => !n.isPinned)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">All Notes</h1>
        <form
          action={async () => {
            'use server'
            await requireAuth()
            const note = await createNote()
            redirect(`/notes/${note.id}`)
          }}
        >
          <button
            type="submit"
            className="text-sm bg-foreground text-background px-3 py-1.5 rounded-md hover:opacity-80 transition-opacity"
          >
            New note
          </button>
        </form>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {allNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-fg gap-2">
            <p className="text-sm">No notes yet.</p>
            <p className="text-xs">Click &ldquo;New note&rdquo; to get started.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {pinned.length > 0 && (
              <>
                <li className="px-6 py-2">
                  <span className="text-xs font-medium text-muted-fg uppercase tracking-wide">Pinned</span>
                </li>
                {pinned.map(note => <NoteRow key={note.id} note={note} />)}
                {unpinned.length > 0 && (
                  <li className="px-6 py-2">
                    <span className="text-xs font-medium text-muted-fg uppercase tracking-wide">Notes</span>
                  </li>
                )}
              </>
            )}
            {unpinned.map(note => <NoteRow key={note.id} note={note} />)}
          </ul>
        )}
      </div>
    </div>
  )
}

function NoteRow({ note }: { note: typeof notes.$inferSelect }) {
  const preview = note.content.slice(0, 120).replace(/[#*`_~]/g, '').trim()
  const date    = new Date(note.updatedAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <li>
      <Link
        href={`/notes/${note.id}`}
        className="flex flex-col gap-0.5 px-6 py-3 hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground truncate">
            {note.title || 'Untitled'}
          </span>
          <span className="text-xs text-muted-fg shrink-0 ml-2">{date}</span>
        </div>
        {preview && (
          <span className="text-xs text-muted-fg truncate">{preview}</span>
        )}
      </Link>
    </li>
  )
}

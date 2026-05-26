'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { updateNote, updateNoteColor, trashNote } from '@/lib/actions/notes'
import { NOTE_COLOR_KEYS, NOTE_SWATCHES, noteColorClass } from '@/lib/note-colors'
import type { Note } from '@/lib/db/schema'

// CodeMirror is heavy — load on demand.
const MarkdownLiveEditor = dynamic(
  () => import('@/components/notes/MarkdownLiveEditor').then(m => m.MarkdownLiveEditor),
  { ssr: false },
)

interface Props {
  note: Note
}

export function NoteEditor({ note }: Props) {
  const router = useRouter()
  const [title, setTitle]     = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [color, setColor]     = useState(note.color)
  const [saving, setSaving]   = useState(false)

  // Escape leaves the editor and returns to the board.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') router.push('/notes')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  const saveTitle = useDebouncedCallback((value: string) => {
    setSaving(true)
    updateNote(note.id, { title: value }).finally(() => setSaving(false))
  }, 800)

  const saveContent = useDebouncedCallback((value: string) => {
    setSaving(true)
    updateNote(note.id, { content: value }).finally(() => setSaving(false))
  }, 800)

  function changeContent(value: string) {
    setContent(value)
    saveContent(value)
  }

  function pickColor(c: string) {
    setColor(c)
    updateNoteColor(note.id, c)
  }

  async function handleTrash() {
    await trashNote(note.id)
    router.push('/notes')
  }

  return (
    <div
      onClick={e => {
        // Clicking the board around the sticky exits back to the canvas.
        if (e.target === e.currentTarget) router.push('/notes')
      }}
      className="dotted-board flex h-full items-center justify-center overflow-auto p-6 sm:p-10"
    >
      <div
        className={`flex h-full max-h-[680px] w-full max-w-3xl flex-col rounded-xl shadow-lg border border-black/10 ${noteColorClass(
          color,
        )}`}
      >
        {/* Sticky header: title + save state */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-2">
          <input
            className="flex-1 bg-transparent text-xl font-semibold text-neutral-900 outline-none placeholder:text-neutral-500"
            value={title}
            placeholder="Untitled"
            onChange={e => {
              setTitle(e.target.value)
              saveTitle(e.target.value)
            }}
          />
          {saving && (
            <span className="shrink-0 text-xs text-neutral-600">Saving…</span>
          )}
        </div>

        {/* Toolbar row: color picker on the left, single-click trash on the right */}
        <div className="flex items-center justify-between gap-3 px-5 pb-1">
          <div className="flex gap-1">
            {NOTE_COLOR_KEYS.map(c => (
              <button
                key={c}
                onClick={() => pickColor(c)}
                aria-label={`Set color ${c}`}
                className={`h-4 w-4 rounded-full ${NOTE_SWATCHES[c]} ${
                  color === c ? 'ring-2 ring-neutral-700 ring-offset-1' : ''
                }`}
              />
            ))}
          </div>
          {/* No two-click confirmation: trashed notes are recoverable from the
              undo toast on the canvas (and from the trash list, future). */}
          <button
            type="button"
            onClick={handleTrash}
            aria-label="Move note to trash"
            title="Move to trash"
            className="rounded-md p-1 text-neutral-600 transition-colors hover:bg-black/10 hover:text-red-600 dark:hover:text-red-500"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 4h11M6 4V2.5h4V4M5 4l.5 9h5L11 4" />
            </svg>
          </button>
        </div>

        {/* Live-preview editor body */}
        <div className="min-h-0 flex-1 px-5 pb-5">
          <MarkdownLiveEditor
            value={content}
            onChange={changeContent}
            onExit={() => router.push('/notes')}
            variant="editor"
          />
        </div>
      </div>
    </div>
  )
}

'use client'

import dynamic from 'next/dynamic'
import { useTransition, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { updateNote } from '@/lib/actions/notes'
import type { Note } from '@/lib/db/schema'

// MDEditor requires client-side only — no SSR
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false })

interface Props {
  note: Note
}

export function NoteEditor({ note }: Props) {
  const [title, setTitle]     = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [saving, setSaving]   = useState(false)
  const [, startTransition]   = useTransition()

  const saveTitle = useDebouncedCallback((value: string) => {
    startTransition(async () => {
      setSaving(true)
      await updateNote(note.id, { title: value })
      setSaving(false)
    })
  }, 800)

  const saveContent = useDebouncedCallback((value: string) => {
    startTransition(async () => {
      setSaving(true)
      await updateNote(note.id, { content: value })
      setSaving(false)
    })
  }, 800)

  return (
    <div className="flex flex-col h-full">
      {/* Title bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <input
          className="flex-1 text-xl font-semibold bg-transparent text-foreground outline-none placeholder:text-muted-fg"
          value={title}
          placeholder="Untitled"
          onChange={(e) => {
            setTitle(e.target.value)
            saveTitle(e.target.value)
          }}
        />
        {saving && (
          <span className="text-xs text-muted-fg shrink-0">Saving…</span>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden" data-color-mode="auto">
        <MDEditor
          value={content}
          onChange={(val) => {
            const v = val ?? ''
            setContent(v)
            saveContent(v)
          }}
          preview="live"
          height="100%"
          style={{ height: '100%' }}
        />
      </div>
    </div>
  )
}

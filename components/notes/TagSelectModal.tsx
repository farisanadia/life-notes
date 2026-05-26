'use client'

import { useEffect, useRef, useState } from 'react'
import type { Tag } from '@/lib/db/schema'

interface Props {
  // Existing tags so typing a known name reuses it instead of duplicating.
  availableTags: Tag[]
  count:    number
  onCancel: () => void
  onConfirm: (input: { tagId?: string; tagName?: string }) => void
}

export function TagSelectModal({ availableTags, count, onCancel, onConfirm }: Props) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const trimmed = name.trim()
  const lowered = trimmed.toLowerCase()
  const matchingTag = availableTags.find(t => t.name.toLowerCase() === lowered)
  const autocompletions = trimmed
    ? availableTags
        .filter(t =>
          t.name.toLowerCase().includes(lowered) && t.name.toLowerCase() !== lowered,
        )
        .slice(0, 5)
    : availableTags.slice(0, 5)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!trimmed || submitting) return
    setSubmitting(true)
    if (matchingTag) {
      onConfirm({ tagId: matchingTag.id })
    } else {
      onConfirm({ tagName: trimmed })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-foreground mb-1">
          Tag {count} note{count === 1 ? '' : 's'} as a topic
        </h2>
        <p className="text-xs text-muted-fg mb-4">
          Pick or type a topic. Click the topic in the sidebar later to gather
          these notes spatially.
        </p>

        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Topic name…"
          className="w-full rounded-md border border-border bg-background text-foreground text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-foreground/20"
        />

        {autocompletions.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {autocompletions.map(t => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setName(t.name)}
                  className="text-xs rounded-full border border-border px-2 py-0.5 text-muted-fg hover:text-foreground hover:bg-surface-hover"
                >
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {matchingTag && (
          <p className="mt-2 text-xs text-muted-fg">
            Will reuse the existing <strong>{matchingTag.name}</strong> topic.
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm rounded-md px-3 py-1.5 text-muted-fg hover:text-foreground hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!trimmed || submitting}
            className="text-sm rounded-md px-3 py-1.5 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--accent-blue)' }}
          >
            {submitting ? 'Tagging…' : 'Tag notes'}
          </button>
        </div>
      </form>
    </div>
  )
}

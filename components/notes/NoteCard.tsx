'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useDebouncedCallback } from 'use-debounce'
import { updateNote, updateNoteColor } from '@/lib/actions/notes'
import { NOTE_COLOR_KEYS, NOTE_SWATCHES, noteColorClass } from '@/lib/note-colors'
import { MoreMenu } from '@/components/notes/MoreMenu'
import type { NoteWithTags } from '@/components/notes/NotesCanvas'

// Heavy: CodeMirror only loads when a card actually enters edit mode.
const MarkdownLiveEditor = dynamic(
  () => import('@/components/notes/MarkdownLiveEditor').then(m => m.MarkdownLiveEditor),
  { ssr: false },
)

const MarkdownPreview = dynamic(
  () => import('@uiw/react-md-editor').then(m => m.default.Markdown),
  { ssr: false },
)

// Rendered markdown for a card. Memoised on the source string so other cards
// don't re-parse markdown when an unrelated note autosaves.
const NoteMarkdown = memo(function NoteMarkdown({ source }: { source: string }) {
  return (
    <div className="sticky-preview h-full overflow-y-auto" data-color-mode="light">
      <MarkdownPreview
        source={source.trim() || '*Empty note*'}
        style={{ background: 'transparent' }}
      />
    </div>
  )
})

const MIN_W = 160
const MIN_H = 120
export const COLLAPSED_HEIGHT = 44

interface Props {
  note: NoteWithTags
  position: { x: number; y: number }
  size: { w: number; h: number }
  z: number
  zoom: number
  collapsed: boolean
  dimmed: boolean
  autoEdit: boolean
  onResize: (w: number, h: number, commit: boolean) => void
  onBringToFront: () => void
  onToggleCollapse: () => void
  onTrash: () => void
}

export function NoteCard({
  note,
  position,
  size,
  z,
  zoom,
  collapsed,
  dimmed,
  autoEdit,
  onResize,
  onBringToFront,
  onToggleCollapse,
  onTrash,
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(() => autoEdit)
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [color, setColor] = useState(note.color)
  const [saving, setSaving] = useState(false)
  const [resizing, setResizing] = useState(false)

  const cardRef = useRef<HTMLDivElement | null>(null)
  const downPos = useRef<{ x: number; y: number } | null>(null)
  const resizeStart = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: note.id, disabled: resizing })

  // The board is scaled by `zoom`; counter-scale the drag translate so the
  // card tracks the cursor 1:1 instead of lagging behind.
  const dragTransform = transform
    ? { ...transform, x: transform.x / zoom, y: transform.y / zoom }
    : null

  const saveTitle = useDebouncedCallback((value: string) => {
    setSaving(true)
    updateNote(note.id, { title: value }).finally(() => setSaving(false))
  }, 800)

  const saveContent = useDebouncedCallback((value: string) => {
    setSaving(true)
    updateNote(note.id, { content: value }).finally(() => setSaving(false))
  }, 800)

  const changeContent = useCallback(
    (value: string) => {
      setContent(value)
      saveContent(value)
    },
    [saveContent],
  )

  const exitEditing = useCallback(() => setEditing(false), [])

  // While editing, clicking elsewhere exits edit mode. Capture phase so we
  // see the event before any inner stopPropagation runs.
  useEffect(() => {
    if (!editing) return
    function onDown(e: PointerEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setEditing(false)
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [editing])

  function setRefs(node: HTMLDivElement | null) {
    setNodeRef(node)
    cardRef.current = node
  }

  // dnd-kit's listeners must run alongside our own pointerdown logic.
  const dragListeners = {
    ...listeners,
    onPointerDown: (e: React.PointerEvent) => {
      downPos.current = { x: e.clientX, y: e.clientY }
      onBringToFront()
      listeners?.onPointerDown?.(e)
    },
  }

  function handleClick(e: React.MouseEvent) {
    if (editing) return
    const start = downPos.current
    if (start) {
      const moved = Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y)
      if (moved > 4) return // it was a drag, not a click
    }
    setEditing(true)
  }

  function pickColor(e: React.MouseEvent, c: string) {
    e.stopPropagation()
    setColor(c)
    updateNoteColor(note.id, c)
  }

  function startResize(e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h }
    setResizing(true)
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  function onResizeMove(e: React.PointerEvent) {
    const start = resizeStart.current
    if (!start) return
    // Pointer moves in screen pixels; the board is scaled by `zoom`.
    const w = Math.max(MIN_W, start.w + (e.clientX - start.x) / zoom)
    const h = Math.max(MIN_H, start.h + (e.clientY - start.y) / zoom)
    onResize(w, h, false)
  }

  function endResize(e: React.PointerEvent) {
    if (!resizeStart.current) return
    resizeStart.current = null
    setResizing(false)
    onResize(size.w, size.h, true)
    ;(e.target as Element).releasePointerCapture(e.pointerId)
  }

  const controlsVisible = editing
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100'

  return (
    <div
      ref={setRefs}
      {...attributes}
      {...dragListeners}
      onClick={handleClick}
      style={{
        left: position.x,
        top: position.y,
        width: size.w,
        height: collapsed ? COLLAPSED_HEIGHT : size.h,
        zIndex: isDragging ? 9999 : z,
        transform: CSS.Translate.toString(dragTransform),
      }}
      className={`group absolute flex flex-col overflow-hidden rounded-md border border-black/5 p-3 shadow-sm transition-opacity ${noteColorClass(
        color,
      )} ${dimmed ? 'opacity-30' : 'opacity-100'} ${editing ? '' : 'select-none'} ${
        isDragging ? 'cursor-grabbing shadow-lg' : editing ? '' : 'cursor-pointer hover:shadow-md'
      }`}
    >
      {/* Hover controls: expand · collapse · trash */}
      <div className={`absolute right-1 top-1 z-10 flex gap-0.5 transition-opacity ${controlsVisible}`}>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            router.push(`/notes/${note.id}`)
          }}
          aria-label="Expand note in editor"
          title="Open in editor"
          className="rounded p-0.5 text-neutral-600 hover:bg-black/10"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 2h5v5M14 2L8.5 7.5M7 14H2V9M2 14l5.5-5.5" />
          </svg>
        </button>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            onToggleCollapse()
          }}
          aria-label={collapsed ? 'Expand note' : 'Collapse note'}
          className="rounded p-0.5 text-neutral-600 hover:bg-black/10"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? <path d="M4 6l4 4 4-4" /> : <path d="M4 10l4-4 4 4" />}
          </svg>
        </button>
        {/* Trash lives behind the overflow menu (with confirmation) so it's
            not adjacent to the commonly-clicked expand/collapse buttons. */}
        <MoreMenu onTrash={onTrash} className="ml-1" />
      </div>

      {/* Title row */}
      <div className="flex shrink-0 items-baseline gap-2 pr-16">
        {editing ? (
          <input
            value={title}
            onChange={e => {
              setTitle(e.target.value)
              saveTitle(e.target.value)
            }}
            onPointerDown={e => e.stopPropagation()}
            placeholder="Untitled"
            className="flex-1 bg-transparent text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-500"
          />
        ) : (
          <h3 className="flex-1 truncate text-sm font-semibold text-neutral-900">
            {note.title || 'Untitled'}
          </h3>
        )}
        {editing && saving && (
          <span className="shrink-0 text-[10px] text-neutral-600">Saving…</span>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Body: live-preview editor when editing, rendered markdown otherwise */}
          <div className="mt-1 min-h-0 flex-1">
            {editing ? (
              <MarkdownLiveEditor
                value={content}
                onChange={changeContent}
                onExit={exitEditing}
              />
            ) : (
              <NoteMarkdown source={content} />
            )}
          </div>

          {note.tags.length > 0 && (
            <div className="mt-2 flex shrink-0 flex-wrap gap-1">
              {note.tags.map(tag => (
                <span
                  key={tag.id}
                  className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] text-neutral-800"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Color picker */}
          <div className={`mt-2 flex shrink-0 gap-1 transition-opacity ${controlsVisible}`}>
            {NOTE_COLOR_KEYS.map(c => (
              <button
                key={c}
                onClick={e => pickColor(e, c)}
                onPointerDown={e => e.stopPropagation()}
                aria-label={`Set color ${c}`}
                className={`h-3.5 w-3.5 rounded-full ${NOTE_SWATCHES[c]} ${
                  color === c ? 'ring-2 ring-neutral-700 ring-offset-1' : ''
                }`}
              />
            ))}
          </div>

          {/* Resize handle */}
          <div
            onPointerDown={startResize}
            onPointerMove={onResizeMove}
            onPointerUp={endResize}
            onClick={e => e.stopPropagation()}
            aria-label="Resize note"
            className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize opacity-0 group-hover:opacity-100"
          >
            <svg viewBox="0 0 16 16" className="h-full w-full text-neutral-500">
              <path d="M11 15L15 11M6 15L15 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </>
      )}
    </div>
  )
}

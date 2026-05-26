'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useDebouncedCallback } from 'use-debounce'
import rehypeSanitize from 'rehype-sanitize'
import { rehypeProxyImages } from '@/lib/proxy-img'
import { updateNote, updateNoteColor } from '@/lib/actions/notes'
import { untagNote } from '@/lib/actions/tags'
import { NOTE_COLOR_KEYS, NOTE_SWATCHES, noteColorClass, tagPillClass } from '@/lib/note-colors'
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

// @uiw/react-markdown-preview applies rehype-raw by default and ships no
// sanitizer, so raw <script>/<img onerror>/<iframe> in a note would otherwise
// reach the DOM. rehype-sanitize runs after rehype-raw and strips them.
// Sanitize first so the proxy rewriter only sees already-validated URLs.
const REHYPE_PLUGINS = [rehypeSanitize, rehypeProxyImages]

// Rendered markdown for a card. Memoised on the source string so other cards
// don't re-parse markdown when an unrelated note autosaves.
const NoteMarkdown = memo(function NoteMarkdown({ source }: { source: string }) {
  return (
    <div className="sticky-preview h-full overflow-y-auto" data-color-mode="light">
      <MarkdownPreview
        source={source.trim() || '*Empty note*'}
        style={{ background: 'transparent' }}
        rehypePlugins={REHYPE_PLUGINS}
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
  selected: boolean
  disabled: boolean
  /** If true (≥1 note already selected), plain click toggles selection. */
  selectionActive: boolean
  /** Live drag-translate (in canvas px) for a non-active card riding a
   *  multi-selection drag. dnd-kit's transform takes precedence for the
   *  card that's actually being grabbed. */
  liveOffset: { x: number; y: number } | null
  autoEdit: boolean
  onResize: (w: number, h: number, commit: boolean) => void
  onBringToFront: () => void
  onToggleCollapse: () => void
  onToggleSelect: () => void
}

export function NoteCard({
  note,
  position,
  size,
  z,
  zoom,
  collapsed,
  dimmed,
  selected,
  disabled,
  selectionActive,
  liveOffset,
  autoEdit,
  onResize,
  onBringToFront,
  onToggleCollapse,
  onToggleSelect,
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(() => autoEdit)
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [color, setColor] = useState(note.color)
  const [saving, setSaving] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)

  const cardRef = useRef<HTMLDivElement | null>(null)
  const downPos = useRef<{ x: number; y: number } | null>(null)
  const resizeStart = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: note.id, disabled: resizing || disabled })

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

  useEffect(() => {
    if (!colorPickerOpen) return
    function onDown(e: PointerEvent) {
      if (!cardRef.current?.contains(e.target as Node)) setColorPickerOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setColorPickerOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [colorPickerOpen])

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
    if (editing || disabled) return
    const start = downPos.current
    if (start) {
      const moved = Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y)
      if (moved > 4) return // it was a drag, not a click
    }
    // Cmd/Ctrl-click toggles selection. Plain click also toggles if a selection
    // is already in progress — otherwise enters edit mode.
    if (e.metaKey || e.ctrlKey || selectionActive) {
      e.stopPropagation()
      onToggleSelect()
      return
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
        transform: dragTransform
          ? CSS.Translate.toString(dragTransform)
          : liveOffset
            ? `translate3d(${liveOffset.x}px, ${liveOffset.y}px, 0)`
            : undefined,
      }}
      className={`group absolute flex flex-col overflow-hidden rounded-md p-3 shadow-sm transition-[opacity,box-shadow] ${noteColorClass(
        color,
      )} ${dimmed ? 'opacity-30' : 'opacity-100'} ${editing ? '' : 'select-none'} ${
        selected
          ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-transparent border-transparent'
          : 'border border-black/5'
      } ${
        isDragging
          ? 'cursor-grabbing shadow-lg'
          : editing
            ? ''
            : disabled
              ? 'cursor-default'
              : 'cursor-pointer hover:shadow-md'
      }`}
    >
      {/* Hover controls: color · expand · collapse · trash */}
      <div className={`absolute right-1 top-1 z-10 flex items-center gap-0.5 transition-opacity ${controlsVisible}`}>
        <div className="relative">
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              setColorPickerOpen(v => !v)
            }}
            aria-label="Change note color"
            title="Change color"
            className="rounded p-0.5 text-neutral-600 hover:bg-black/10"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
              <circle cx="8"    cy="3.6"  r="3.4" fill="#facc15" />
              <circle cx="3.6"  cy="11.2" r="3.4" fill="#f472b6" />
              <circle cx="12.4" cy="11.2" r="3.4" fill="#60a5fa" />
            </svg>
          </button>
          {colorPickerOpen && (
            <div
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              className="absolute right-0 top-full mt-1 flex gap-1 rounded-md border border-black/10 bg-white/95 p-1 shadow-md backdrop-blur"
            >
              {NOTE_COLOR_KEYS.map(c => (
                <button
                  key={c}
                  onClick={e => {
                    pickColor(e, c)
                    setColorPickerOpen(false)
                  }}
                  onPointerDown={e => e.stopPropagation()}
                  aria-label={`Set color ${c}`}
                  className={`h-4 w-4 rounded-full ${NOTE_SWATCHES[c]} ${
                    color === c ? 'ring-2 ring-neutral-700 ring-offset-1' : ''
                  }`}
                />
              ))}
            </div>
          )}
        </div>
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
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? <path d="M2.5 5.5l5.5 5 5.5-5" /> : <path d="M2.5 10.5l5.5-5 5.5 5" />}
          </svg>
        </button>
        {/* Trashing happens by dragging the card onto the trash zone in the
            canvas's bottom-left corner — see TrashDropZone in NotesCanvas. */}
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
                  className={`group/tag inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-xs font-medium ${tagPillClass(tag.color)}`}
                >
                  <span>{tag.name}</span>
                  <button
                    type="button"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation()
                      untagNote(note.id, tag.id).then(() => router.refresh())
                    }}
                    aria-label={`Remove tag ${tag.name}`}
                    title={`Remove tag "${tag.name}"`}
                    className="rounded-full p-0.5 opacity-0 hover:bg-black/20 group-hover/tag:opacity-100"
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 3l10 10M13 3L3 13" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

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

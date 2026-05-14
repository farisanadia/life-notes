'use client'

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
  useTransition,
} from 'react'
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  createNote,
  updateNotePosition,
  updateNoteSize,
  updateNoteZIndex,
  setNoteCollapsed,
  trashNote,
  restoreNote,
} from '@/lib/actions/notes'
import { NoteCard, COLLAPSED_HEIGHT } from '@/components/notes/NoteCard'
import type { Note, Tag } from '@/lib/db/schema'

export type NoteWithTags = Note & { tags: Tag[] }

// Empty space kept beyond the furthest note so there's always room to drag into.
const CANVAS_MARGIN = 600
const MIN_ZOOM = 0.2
const MAX_ZOOM = 1
const TRASH_DROP_ID = 'trash-zone'
const UNDO_WINDOW_MS = 6000

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

interface Props {
  notes: NoteWithTags[]
}

export function NotesCanvas({ notes }: Props) {
  // Overrides layered on top of the persisted note values, for optimistic updates.
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({})
  const [zOrder, setZOrder] = useState<Record<string, number>>({})
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(1)
  const [autoEditId, setAutoEditId] = useState<string | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [undoToast, setUndoToast] = useState<{ id: string; title: string } | null>(null)
  const [isCreating, startCreate] = useTransition()

  const scrollRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  zoomRef.current = zoom
  // Scroll position to apply after a zoom change re-renders the sizer.
  const pendingScroll = useRef<{ left: number; top: number } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const posOf = (note: NoteWithTags) =>
    positions[note.id] ?? { x: note.positionX, y: note.positionY }
  const sizeOf = (note: NoteWithTags) =>
    sizes[note.id] ?? { w: note.width, h: note.height }
  const zOf = (note: NoteWithTags) => zOrder[note.id] ?? note.zIndex
  const collapsedOf = (note: NoteWithTags) =>
    collapsed[note.id] ?? note.isCollapsed
  const effHeight = (note: NoteWithTags) =>
    collapsedOf(note) ? COLLAPSED_HEIGHT : sizeOf(note).h

  const allTags = useMemo(() => {
    const byId = new Map<string, Tag>()
    for (const note of notes) {
      for (const tag of note.tags) byId.set(tag.id, tag)
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [notes])

  // Canvas grows to fit the furthest-out note plus a margin.
  const { canvasW, canvasH } = useMemo(() => {
    let maxX = 0
    let maxY = 0
    for (const note of notes) {
      const { x, y } = posOf(note)
      maxX = Math.max(maxX, x + sizeOf(note).w)
      maxY = Math.max(maxY, y + effHeight(note))
    }
    return { canvasW: maxX + CANVAS_MARGIN, canvasH: maxY + CANVAS_MARGIN }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, positions, sizes, collapsed])

  // Apply the queued scroll position once the zoomed sizer has re-rendered.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && pendingScroll.current) {
      el.scrollLeft = pendingScroll.current.left
      el.scrollTop = pendingScroll.current.top
      pendingScroll.current = null
    }
  }, [zoom])

  // Auto-dismiss the undo toast after the window expires.
  useEffect(() => {
    if (!undoToast) return
    const t = window.setTimeout(() => setUndoToast(null), UNDO_WINDOW_MS)
    return () => window.clearTimeout(t)
  }, [undoToast])

  // Zoom changes keep the given viewport anchor point fixed on the canvas.
  function zoomTo(next: number, anchorX: number, anchorY: number) {
    const el = scrollRef.current
    const current = zoomRef.current
    const clamped = clamp(next, MIN_ZOOM, MAX_ZOOM)
    if (el) {
      const canvasX = (el.scrollLeft + anchorX) / current
      const canvasY = (el.scrollTop + anchorY) / current
      pendingScroll.current = {
        left: canvasX * clamped - anchorX,
        top: canvasY * clamped - anchorY,
      }
    }
    setZoom(clamped)
  }

  function zoomBy(factor: number) {
    const el = scrollRef.current
    zoomTo(zoomRef.current * factor, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2)
  }

  function fitToContent() {
    const el = scrollRef.current
    if (!el) return
    let maxX = 0
    let maxY = 0
    for (const note of notes) {
      const { x, y } = posOf(note)
      maxX = Math.max(maxX, x + sizeOf(note).w)
      maxY = Math.max(maxY, y + effHeight(note))
    }
    const pad = 80
    const next = clamp(
      Math.min(el.clientWidth / (maxX + pad), el.clientHeight / (maxY + pad)),
      MIN_ZOOM,
      MAX_ZOOM,
    )
    pendingScroll.current = { left: 0, top: 0 }
    setZoom(next)
  }

  // ctrl/⌘ + wheel zooms toward the pointer. Native listener so preventDefault works.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el!.getBoundingClientRect()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      zoomTo(zoomRef.current * factor, e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleTag(id: string) {
    setActiveTags(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function matchesFilter(note: NoteWithTags) {
    if (activeTags.size === 0) return true
    return note.tags.some(t => activeTags.has(t.id))
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event
    const id = String(active.id)
    setActiveDragId(null)

    const note = notes.find(n => n.id === id)
    if (!note) return

    if (over?.id === TRASH_DROP_ID) {
      handleTrash(note)
      return
    }

    const base = posOf(note)
    // delta is in screen pixels; convert to canvas units for the scaled board.
    const x = Math.max(0, base.x + delta.x / zoomRef.current)
    const y = Math.max(0, base.y + delta.y / zoomRef.current)

    setPositions(prev => ({ ...prev, [id]: { x, y } }))
    updateNotePosition(id, x, y)
  }

  function handleResize(id: string, w: number, h: number, commit: boolean) {
    setSizes(prev => ({ ...prev, [id]: { w, h } }))
    if (commit) updateNoteSize(id, w, h)
  }

  function bringToFront(id: string) {
    const note = notes.find(n => n.id === id)
    if (!note) return
    const maxZ = Math.max(0, ...notes.map(zOf))
    if (zOf(note) >= maxZ && maxZ > 0) return // already on top
    const next = maxZ + 1
    setZOrder(prev => ({ ...prev, [id]: next }))
    updateNoteZIndex(id, next)
  }

  function toggleCollapse(id: string) {
    const note = notes.find(n => n.id === id)
    if (!note) return
    const next = !collapsedOf(note)
    setCollapsed(prev => ({ ...prev, [id]: next }))
    setNoteCollapsed(id, next)
  }

  function handleTrash(note: NoteWithTags) {
    setUndoToast({ id: note.id, title: note.title || 'Untitled' })
    trashNote(note.id)
  }

  function handleUndoTrash() {
    if (!undoToast) return
    const id = undoToast.id
    setUndoToast(null)
    restoreNote(id)
  }

  function handleNewNote() {
    const el = scrollRef.current
    const z = zoomRef.current
    // Drop the new sticky in the centre of whatever the user is currently viewing.
    const x = el ? (el.scrollLeft + el.clientWidth / 2) / z - 120 : 40
    const y = el ? (el.scrollTop + el.clientHeight / 2) / z - 110 : 40
    // Put the new card on top of every other card, otherwise it can spawn
    // hidden behind one the user already raised.
    const newZ = Math.max(0, ...notes.map(zOf)) + 1
    startCreate(async () => {
      const note = await createNote({ positionX: x, positionY: y, zIndex: newZ })
      setAutoEditId(note.id)
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">All Notes</h1>
        <button
          onClick={handleNewNote}
          disabled={isCreating}
          className="text-sm bg-foreground text-background px-3 py-1.5 rounded-md hover:opacity-80 transition-opacity disabled:opacity-50"
        >
          {isCreating ? 'Adding…' : 'New note'}
        </button>
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-2 border-b border-border overflow-x-auto">
          {allTags.map(tag => {
            const active = activeTags.has(tag.id)
            return (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors shrink-0 ${
                  active
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border text-muted-fg hover:text-foreground'
                }`}
              >
                {tag.name}
              </button>
            )
          })}
          {activeTags.size > 0 && (
            <button
              onClick={() => setActiveTags(new Set())}
              className="text-xs text-muted-fg hover:text-foreground shrink-0 ml-1"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Canvas area */}
      <div className="relative flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-auto dotted-board">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-fg gap-2">
              <p className="text-sm">No notes yet.</p>
              <p className="text-xs">Click &ldquo;New note&rdquo; to get started.</p>
            </div>
          ) : (
            <DndContext
              id="notes-canvas"
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              {/* Sizer gives the scroll area the scaled extent */}
              <div
                className="min-h-full min-w-full"
                style={{ width: canvasW * zoom, height: canvasH * zoom }}
              >
                {/* Scaled board */}
                <div
                  className="relative"
                  style={{
                    width: canvasW,
                    height: canvasH,
                    transform: `scale(${zoom})`,
                    transformOrigin: '0 0',
                  }}
                >
                  {notes.map(note => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      position={posOf(note)}
                      size={sizeOf(note)}
                      z={zOf(note)}
                      zoom={zoom}
                      collapsed={collapsedOf(note)}
                      dimmed={!matchesFilter(note)}
                      autoEdit={autoEditId === note.id}
                      onResize={(w, h, commit) => handleResize(note.id, w, h, commit)}
                      onBringToFront={() => bringToFront(note.id)}
                      onToggleCollapse={() => toggleCollapse(note.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Drop here to trash. Rendered inside DndContext but outside
                  the scaled board so it stays fixed to the viewport. */}
              <TrashDropZone dragging={activeDragId !== null} />
            </DndContext>
          )}
        </div>

        {/* Zoom control — fixed in the viewport corner */}
        {notes.length > 0 && (
          <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-lg border border-border bg-surface/95 px-1 py-1 shadow-md backdrop-blur">
            <button
              onClick={() => zoomBy(0.8)}
              aria-label="Zoom out"
              className="h-7 w-7 rounded-md text-muted-fg hover:bg-surface-hover hover:text-foreground"
            >
              −
            </button>
            <button
              onClick={() => zoomTo(1, (scrollRef.current?.clientWidth ?? 0) / 2, (scrollRef.current?.clientHeight ?? 0) / 2)}
              className="w-12 rounded-md text-xs tabular-nums text-muted-fg hover:bg-surface-hover hover:text-foreground"
              title="Reset to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => zoomBy(1.25)}
              aria-label="Zoom in"
              className="h-7 w-7 rounded-md text-muted-fg hover:bg-surface-hover hover:text-foreground"
            >
              +
            </button>
            <button
              onClick={fitToContent}
              className="ml-0.5 rounded-md px-2 py-1 text-xs text-muted-fg hover:bg-surface-hover hover:text-foreground"
              title="Fit all notes in view"
            >
              Fit
            </button>
          </div>
        )}

        {/* Undo toast for the last drag-to-trash */}
        {undoToast && (
          <div className="absolute bottom-4 left-1/2 z-40 -translate-x-1/2 transform">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface/95 px-4 py-2 shadow-md backdrop-blur">
              <span className="text-xs text-foreground">
                Trashed &ldquo;{undoToast.title}&rdquo;
              </span>
              <button
                onClick={handleUndoTrash}
                className="rounded px-2 py-1 text-xs font-medium text-foreground underline-offset-2 hover:underline"
              >
                Undo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface TrashDropZoneProps {
  dragging: boolean
}

function TrashDropZone({ dragging }: TrashDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id: TRASH_DROP_ID })
  // Hidden when nothing's being dragged so it doesn't add chrome to a quiet
  // canvas; appears (and brightens) the moment the user picks up a card.
  return (
    <div
      ref={setNodeRef}
      aria-label="Drop here to trash"
      className={`fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full border-2 border-dashed px-4 py-3 shadow-md backdrop-blur transition-all ${
        dragging ? 'pointer-events-auto opacity-100 scale-100' : 'pointer-events-none opacity-0 scale-95'
      } ${
        isOver
          ? 'border-red-500 bg-red-500/15 text-red-600 dark:text-red-400'
          : 'border-border bg-surface/95 text-muted-fg'
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 4h11M6 4V2.5h4V4M5 4l.5 9h5L11 4" />
      </svg>
      <span className="text-xs font-medium">
        {isOver ? 'Release to trash' : 'Drop to trash'}
      </span>
    </div>
  )
}

'use client'

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
  useTransition,
} from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  createNote,
  updateNotePosition,
  updateNotePositions,
  updateNoteSize,
  updateNoteZIndex,
  setNoteCollapsed,
  trashNote,
  restoreNote,
} from '@/lib/actions/notes'
import { applyTopicToNotes } from '@/lib/actions/tags'
import { NoteCard, COLLAPSED_HEIGHT } from '@/components/notes/NoteCard'
import { TagSelectModal } from '@/components/notes/TagSelectModal'
import {
  rectFromPoints,
  notesInsideMarquee,
  type MarqueeRect,
} from '@/lib/marquee'
import { topicLayout } from '@/lib/topic-view'
import { pushOutOfBbox } from '@/lib/displace'
import type { Note, Tag } from '@/lib/db/schema'

export type NoteWithTags = Note & { tags: Tag[] }

const CANVAS_MARGIN = 600
const MIN_ZOOM = 0.2
const MAX_ZOOM = 1
const TRASH_DROP_ID = 'trash-zone'
const UNDO_WINDOW_MS = 6000
const MARQUEE_MIN_AREA = 64 // px² in canvas units — below this, treat as a click

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

interface Props {
  notes: NoteWithTags[]
}

interface TopicView {
  tagId:    string
  tagName:  string
  original: Map<string, { x: number; y: number }>
  target:   Map<string, { x: number; y: number }>
  bbox:     { x: number; y: number; w: number; h: number }
}

const TOPIC_BORDER_PADDING = 24
const TOPIC_Z_BASE = 100000
const PUSH_ASIDE_PADDING = 16
const SELECTION_BBOX_PADDING = 16

export function NotesCanvas({ notes }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({})
  const [zOrder, setZOrder] = useState<Record<string, number>>({})
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [zoom, setZoom] = useState(1)
  const [autoEditId, setAutoEditId] = useState<string | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [undoToast, setUndoToast] = useState<{ id: string; title: string } | null>(null)
  const [isCreating, startCreate] = useTransition()
  // Marquee selection
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [tagModalOpen, setTagModalOpen] = useState(false)
  // Topic-view preview
  const [topicView, setTopicView] = useState<TopicView | null>(null)
  const [savingTopic, startSavingTopic] = useTransition()
  // Live translate applied to non-active selected cards (and the selection
  // bbox) while a multi-select drag or a bbox drag is in progress.
  const [selectionDragOffset, setSelectionDragOffset] =
    useState<{ x: number; y: number } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  zoomRef.current = zoom
  const pendingScroll = useRef<{ left: number; top: number } | null>(null)
  // Marquee pointer state kept in refs so move events don't trigger renders
  // until the rect actually changes shape enough to repaint.
  const marqueeStart = useRef<{ x: number; y: number } | null>(null)
  const marqueePointerId = useRef<number | null>(null)
  // Snapshot of bbox + target positions at the start of a bbox drag, used to
  // recompute everything from a stable origin on each pointermove.
  const bboxDragRef = useRef<{
    startPt: { x: number; y: number }
    startBbox: { x: number; y: number; w: number; h: number }
    startTargets: Map<string, { x: number; y: number }>
    pointerId: number
  } | null>(null)
  const selectionBboxDragRef = useRef<{
    startPt: { x: number; y: number }
    startPositions: Map<string, { x: number; y: number }>
    pointerId: number
  } | null>(null)

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

  // Non-topic notes that the topic-view bbox would otherwise cover get pushed
  // to the closest edge so the gathered arrangement isn't visually crowded.
  const displaced = useMemo(() => {
    const out = new Map<string, { x: number; y: number }>()
    if (!topicView) return out
    for (const note of notes) {
      if (topicView.target.has(note.id)) continue
      const p = posOf(note)
      const s = sizeOf(note)
      const h = collapsedOf(note) ? COLLAPSED_HEIGHT : s.h
      const push = pushOutOfBbox(
        { x: p.x, y: p.y, w: s.w, h },
        topicView.bbox,
        PUSH_ASIDE_PADDING,
      )
      if (push) out.set(note.id, { x: p.x + push.dx, y: p.y + push.dy })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicView, notes, positions, sizes, collapsed])

  const displayPos = (note: NoteWithTags) => {
    if (topicView?.target.has(note.id)) return topicView.target.get(note.id)!
    if (displaced.has(note.id)) return displaced.get(note.id)!
    return posOf(note)
  }

  const allTags = useMemo(() => {
    const byId = new Map<string, Tag>()
    for (const note of notes) {
      for (const tag of note.tags) byId.set(tag.id, tag)
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [notes])

  const { canvasW, canvasH } = useMemo(() => {
    let maxX = 0
    let maxY = 0
    for (const note of notes) {
      const { x, y } = displayPos(note)
      maxX = Math.max(maxX, x + sizeOf(note).w)
      maxY = Math.max(maxY, y + effHeight(note))
    }
    return { canvasW: maxX + CANVAS_MARGIN, canvasH: maxY + CANVAS_MARGIN }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, positions, sizes, collapsed, topicView])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && pendingScroll.current) {
      el.scrollLeft = pendingScroll.current.left
      el.scrollTop = pendingScroll.current.top
      pendingScroll.current = null
    }
  }, [zoom])

  useEffect(() => {
    if (!undoToast) return
    const t = window.setTimeout(() => setUndoToast(null), UNDO_WINDOW_MS)
    return () => window.clearTimeout(t)
  }, [undoToast])

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
      const { x, y } = displayPos(note)
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

  // Sidebar topic click → select every note with that tag (no rearrange) and
  // pan the viewport to the centre of those notes without changing zoom.
  useEffect(() => {
    const tagId = searchParams.get('select')
    if (!tagId) return
    router.replace('/notes', { scroll: false })
    const members = notes.filter(n => n.tags.some(t => t.id === tagId))
    if (members.length === 0) return
    setSelectedIds(new Set(members.map(n => n.id)))

    const el = scrollRef.current
    if (!el) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of members) {
      const p = posOf(n)
      const s = sizeOf(n)
      const h = collapsedOf(n) ? COLLAPSED_HEIGHT : s.h
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x + s.w > maxX) maxX = p.x + s.w
      if (p.y + h > maxY) maxY = p.y + h
    }
    const z = zoomRef.current
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const left = Math.max(0, cx * z - el.clientWidth / 2)
    const top  = Math.max(0, cy * z - el.clientHeight / 2)
    el.scrollTo({ left, top, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Topic-view trigger via ?topic=<tagId> (sidebar gather icon).
  useEffect(() => {
    const tagId = searchParams.get('topic')
    if (!tagId) return
    // Clear the param immediately so re-clicking the same topic re-fires.
    router.replace('/notes', { scroll: false })

    const tag = allTags.find(t => t.id === tagId)
    if (!tag) return
    const member = notes.filter(n => n.tags.some(t => t.id === tagId))
    if (member.length === 0) return

    const el = scrollRef.current
    const z = zoomRef.current
    const cx = el ? (el.scrollLeft + el.clientWidth / 2) / z : 400
    const cy = el ? (el.scrollTop + el.clientHeight / 2) / z : 400

    const sized = member.map(n => ({ id: n.id, w: sizeOf(n).w, h: effHeight(n) }))
    const targets = topicLayout(sized, { x: cx, y: cy })

    const original = new Map<string, { x: number; y: number }>()
    const target   = new Map<string, { x: number; y: number }>()
    for (const n of member) original.set(n.id, posOf(n))
    for (const t of targets) target.set(t.id, { x: t.x, y: t.y })

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const t of targets) {
      const s = sized.find(x => x.id === t.id)!
      if (t.x < minX) minX = t.x
      if (t.y < minY) minY = t.y
      if (t.x + s.w > maxX) maxX = t.x + s.w
      if (t.y + s.h > maxY) maxY = t.y + s.h
    }
    const bbox = {
      x: minX - TOPIC_BORDER_PADDING,
      y: minY - TOPIC_BORDER_PADDING,
      w: (maxX - minX) + TOPIC_BORDER_PADDING * 2,
      h: (maxY - minY) + TOPIC_BORDER_PADDING * 2,
    }

    setSelectedIds(new Set())
    setMarquee(null)
    setTopicView({ tagId, tagName: tag.name, original, target, bbox })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Esc cancels marquee / topic-view preview.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (topicView) {
        setTopicView(null)
        return
      }
      if (marquee || selectedIds.size > 0) {
        setMarquee(null)
        marqueeStart.current = null
        setSelectedIds(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [marquee, selectedIds, topicView])

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id))
  }

  function handleDragMove(event: DragMoveEvent) {
    if (topicView) return
    const id = String(event.active.id)
    if (selectedIds.size <= 1 || !selectedIds.has(id)) return
    setSelectionDragOffset({
      x: event.delta.x / zoomRef.current,
      y: event.delta.y / zoomRef.current,
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event
    const id = String(active.id)
    setActiveDragId(null)
    setSelectionDragOffset(null)

    if (topicView) return // preview mode — ignore drags

    const note = notes.find(n => n.id === id)
    if (!note) return

    if (over?.id === TRASH_DROP_ID) {
      handleTrash(note)
      return
    }

    const dx = delta.x / zoomRef.current
    const dy = delta.y / zoomRef.current

    // Dragging any one of a multi-selection translates them all together.
    if (selectedIds.size > 1 && selectedIds.has(id)) {
      const updates: { id: string; x: number; y: number }[] = []
      const optimistic: Record<string, { x: number; y: number }> = {}
      for (const sid of selectedIds) {
        const sn = notes.find(n => n.id === sid)
        if (!sn) continue
        const p = posOf(sn)
        const x = Math.max(0, p.x + dx)
        const y = Math.max(0, p.y + dy)
        updates.push({ id: sid, x, y })
        optimistic[sid] = { x, y }
      }
      setPositions(prev => ({ ...prev, ...optimistic }))
      updateNotePositions(updates)
      return
    }

    const base = posOf(note)
    const x = Math.max(0, base.x + dx)
    const y = Math.max(0, base.y + dy)

    setPositions(prev => ({ ...prev, [id]: { x, y } }))
    updateNotePosition(id, x, y)
  }

  // ── Marquee selection ─────────────────────────────────────────────────────

  function pointerToCanvas(e: React.PointerEvent): { x: number; y: number } | null {
    const board = boardRef.current
    if (!board) return null
    const rect = board.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / zoomRef.current,
      y: (e.clientY - rect.top)  / zoomRef.current,
    }
  }

  function onBoardPointerDown(e: React.PointerEvent) {
    // Only fires when the empty board itself is the target — note cards stop
    // propagation via their drag listeners, so we won't see those.
    if (e.target !== e.currentTarget) return
    if (e.button !== 0) return
    if (topicView) return
    const pt = pointerToCanvas(e)
    if (!pt) return
    marqueeStart.current = pt
    marqueePointerId.current = e.pointerId
    setSelectedIds(new Set())
    setMarquee({ x: pt.x, y: pt.y, w: 0, h: 0 })
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  function onBoardPointerMove(e: React.PointerEvent) {
    if (marqueeStart.current === null) return
    if (e.pointerId !== marqueePointerId.current) return
    const pt = pointerToCanvas(e)
    if (!pt) return
    const rect = rectFromPoints(marqueeStart.current, pt)
    setMarquee(rect)
    const ids = notesInsideMarquee(
      rect,
      notes.map(n => {
        const p = posOf(n)
        const s = sizeOf(n)
        return { id: n.id, x: p.x, y: p.y, w: s.w, h: effHeight(n) }
      }),
    )
    setSelectedIds(new Set(ids))
  }

  function onBoardPointerUp(e: React.PointerEvent) {
    if (marqueeStart.current === null) return
    const rect = marquee
    marqueeStart.current = null
    marqueePointerId.current = null
    ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    setMarquee(null)
    if (!rect || rect.w * rect.h < MARQUEE_MIN_AREA) {
      // It was a click on the empty board — clear any prior selection.
      setSelectedIds(new Set())
    }
    // Otherwise leave selection in place; the action bar offers Tag / Delete.
  }

  function toggleSelectNote(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function confirmTagSelection(input: { tagId?: string; tagName?: string }) {
    if (selectedIds.size === 0) return
    const noteIds = [...selectedIds]
    setTagModalOpen(false)
    setSelectedIds(new Set())
    applyTopicToNotes({ noteIds, ...input })
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return
    const ids = [...selectedIds]
    setSelectedIds(new Set())
    for (const id of ids) trashNote(id)
  }

  // ── Topic view ───────────────────────────────────────────────────────────

  function keepTopicArrangement() {
    if (!topicView) return
    const updates: { id: string; x: number; y: number }[] = []
    // Mirror the new positions into the optimistic override map so the canvas
    // doesn't snap back the moment we clear topic-view state.
    const optimistic: Record<string, { x: number; y: number }> = {}
    for (const [id, p] of topicView.target) {
      updates.push({ id, x: p.x, y: p.y })
      optimistic[id] = { x: p.x, y: p.y }
    }
    // Keep the non-topic notes that were shoved aside in their displaced spots
    // — otherwise they snap back and re-cover the arrangement we just saved.
    for (const [id, p] of displaced) {
      updates.push({ id, x: p.x, y: p.y })
      optimistic[id] = { x: p.x, y: p.y }
    }
    setPositions(prev => ({ ...prev, ...optimistic }))
    setTopicView(null)
    startSavingTopic(async () => {
      await updateNotePositions(updates)
    })
  }

  function cancelTopicView() {
    setTopicView(null)
  }

  // Tight AABB around currently-selected notes. Outside topic-view only.
  const selectionBbox = useMemo(() => {
    if (topicView || selectedIds.size === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const note of notes) {
      if (!selectedIds.has(note.id)) continue
      const p = posOf(note)
      const s = sizeOf(note)
      const h = collapsedOf(note) ? COLLAPSED_HEIGHT : s.h
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x + s.w > maxX) maxX = p.x + s.w
      if (p.y + h > maxY) maxY = p.y + h
    }
    if (minX === Infinity) return null
    return {
      x: minX - SELECTION_BBOX_PADDING,
      y: minY - SELECTION_BBOX_PADDING,
      w: (maxX - minX) + SELECTION_BBOX_PADDING * 2,
      h: (maxY - minY) + SELECTION_BBOX_PADDING * 2,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicView, selectedIds, notes, positions, sizes, collapsed])

  function onSelectionBboxPointerDown(e: React.PointerEvent) {
    if (!selectionBbox || topicView) return
    if (e.button !== 0) return
    const pt = pointerToCanvas(e)
    if (!pt) return
    e.stopPropagation()
    const startPositions = new Map<string, { x: number; y: number }>()
    for (const note of notes) {
      if (selectedIds.has(note.id)) startPositions.set(note.id, posOf(note))
    }
    selectionBboxDragRef.current = {
      startPt: pt,
      startPositions,
      pointerId: e.pointerId,
    }
    setSelectionDragOffset({ x: 0, y: 0 })
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  function onSelectionBboxPointerMove(e: React.PointerEvent) {
    const drag = selectionBboxDragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    const pt = pointerToCanvas(e)
    if (!pt) return
    setSelectionDragOffset({
      x: pt.x - drag.startPt.x,
      y: pt.y - drag.startPt.y,
    })
  }

  function onSelectionBboxPointerUp(e: React.PointerEvent) {
    const drag = selectionBboxDragRef.current
    if (!drag) return
    ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    selectionBboxDragRef.current = null
    const delta = selectionDragOffset
    setSelectionDragOffset(null)
    if (!delta || (delta.x === 0 && delta.y === 0)) return
    const updates: { id: string; x: number; y: number }[] = []
    const optimistic: Record<string, { x: number; y: number }> = {}
    for (const [id, p] of drag.startPositions) {
      const x = Math.max(0, p.x + delta.x)
      const y = Math.max(0, p.y + delta.y)
      updates.push({ id, x, y })
      optimistic[id] = { x, y }
    }
    setPositions(prev => ({ ...prev, ...optimistic }))
    updateNotePositions(updates)
  }

  function onBboxPointerDown(e: React.PointerEvent) {
    if (!topicView) return
    if (e.button !== 0) return
    const pt = pointerToCanvas(e)
    if (!pt) return
    e.stopPropagation()
    bboxDragRef.current = {
      startPt: pt,
      startBbox: { ...topicView.bbox },
      startTargets: new Map(topicView.target),
      pointerId: e.pointerId,
    }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  function onBboxPointerMove(e: React.PointerEvent) {
    const drag = bboxDragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    const pt = pointerToCanvas(e)
    if (!pt) return
    const dx = pt.x - drag.startPt.x
    const dy = pt.y - drag.startPt.y
    setTopicView(prev => {
      if (!prev) return prev
      const target = new Map<string, { x: number; y: number }>()
      for (const [id, p] of drag.startTargets) {
        target.set(id, { x: p.x + dx, y: p.y + dy })
      }
      return {
        ...prev,
        bbox: { ...drag.startBbox, x: drag.startBbox.x + dx, y: drag.startBbox.y + dy },
        target,
      }
    })
  }

  function onBboxPointerUp(e: React.PointerEvent) {
    if (!bboxDragRef.current) return
    bboxDragRef.current = null
    ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
  }

  // ── Notes/state helpers ──────────────────────────────────────────────────

  function handleResize(id: string, w: number, h: number, commit: boolean) {
    setSizes(prev => ({ ...prev, [id]: { w, h } }))
    if (commit) updateNoteSize(id, w, h)
  }

  function bringToFront(id: string) {
    if (topicView) return
    const note = notes.find(n => n.id === id)
    if (!note) return
    const maxZ = Math.max(0, ...notes.map(zOf))
    if (zOf(note) >= maxZ && maxZ > 0) return
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
    const x = el ? (el.scrollLeft + el.clientWidth / 2) / z - 120 : 40
    const y = el ? (el.scrollTop + el.clientHeight / 2) / z - 110 : 40
    const newZ = Math.max(0, ...notes.map(zOf)) + 1
    startCreate(async () => {
      const note = await createNote({ positionX: x, positionY: y, zIndex: newZ })
      setAutoEditId(note.id)
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-auto dotted-board">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-fg gap-2">
              <p className="text-sm">No notes yet.</p>
              <p className="text-xs">Tap the + button to get started.</p>
            </div>
          ) : (
            <DndContext
              id="notes-canvas"
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
            >
              <div
                className="min-h-full min-w-full"
                style={{ width: canvasW * zoom, height: canvasH * zoom }}
              >
                <div
                  ref={boardRef}
                  onPointerDown={onBoardPointerDown}
                  onPointerMove={onBoardPointerMove}
                  onPointerUp={onBoardPointerUp}
                  onPointerCancel={onBoardPointerUp}
                  className="relative"
                  style={{
                    width: canvasW,
                    height: canvasH,
                    transform: `scale(${zoom})`,
                    transformOrigin: '0 0',
                  }}
                >
                  {topicView && (
                    <div
                      onPointerDown={onBboxPointerDown}
                      onPointerMove={onBboxPointerMove}
                      onPointerUp={onBboxPointerUp}
                      onPointerCancel={onBboxPointerUp}
                      title="Drag to move the arrangement"
                      className="absolute cursor-move rounded-xl border-2 border-dashed border-blue-500/70 bg-blue-500/5"
                      style={{
                        left:   topicView.bbox.x,
                        top:    topicView.bbox.y,
                        width:  topicView.bbox.w,
                        height: topicView.bbox.h,
                        zIndex: TOPIC_Z_BASE - 1,
                      }}
                    />
                  )}

                  {selectionBbox && (
                    <div
                      onPointerDown={onSelectionBboxPointerDown}
                      onPointerMove={onSelectionBboxPointerMove}
                      onPointerUp={onSelectionBboxPointerUp}
                      onPointerCancel={onSelectionBboxPointerUp}
                      title="Drag to move the selection"
                      className="absolute cursor-move rounded-xl border-2 border-dashed border-blue-500/70 bg-blue-500/5"
                      style={{
                        left:   selectionBbox.x + (selectionDragOffset?.x ?? 0),
                        top:    selectionBbox.y + (selectionDragOffset?.y ?? 0),
                        width:  selectionBbox.w,
                        height: selectionBbox.h,
                        zIndex: TOPIC_Z_BASE - 1,
                      }}
                    />
                  )}

                  {notes.map((note, i) => {
                    const inTopic = topicView?.target.has(note.id) ?? false
                    const isSelected = selectedIds.has(note.id)
                    const dimmed = topicView
                      ? !inTopic
                      : selectedIds.size > 0
                        ? !isSelected
                        : false
                    const isActive = activeDragId === note.id
                    return (
                      <NoteCard
                        key={note.id}
                        note={note}
                        position={displayPos(note)}
                        size={sizeOf(note)}
                        z={
                          (topicView && inTopic) ||
                          (!topicView && isSelected)
                            ? TOPIC_Z_BASE + i
                            : zOf(note)
                        }
                        zoom={zoom}
                        collapsed={collapsedOf(note)}
                        dimmed={dimmed}
                        selected={isSelected}
                        disabled={topicView !== null}
                        selectionActive={selectedIds.size > 0}
                        liveOffset={
                          isSelected && !isActive && selectionDragOffset
                            ? selectionDragOffset
                            : null
                        }
                        autoEdit={autoEditId === note.id}
                        onResize={(w, h, commit) => handleResize(note.id, w, h, commit)}
                        onBringToFront={() => bringToFront(note.id)}
                        onToggleCollapse={() => toggleCollapse(note.id)}
                        onToggleSelect={() => toggleSelectNote(note.id)}
                      />
                    )
                  })}

                  {marquee && marquee.w > 0 && marquee.h > 0 && (
                    <div
                      aria-hidden
                      className="absolute pointer-events-none rounded-sm border border-blue-500 bg-blue-500/10"
                      style={{
                        left:   marquee.x,
                        top:    marquee.y,
                        width:  marquee.w,
                        height: marquee.h,
                      }}
                    />
                  )}
                </div>
              </div>

              <TrashDropZone dragging={activeDragId !== null} />
            </DndContext>
          )}
        </div>

        <button
          onClick={handleNewNote}
          disabled={isCreating || topicView !== null}
          aria-label={isCreating ? 'Adding note' : 'New note'}
          title="New note"
          className="absolute bottom-4 right-4 z-30 h-14 w-14 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--accent-blue)' }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {notes.length > 0 && (
          <div className="absolute bottom-4 right-24 flex items-center gap-1 rounded-lg border border-border bg-surface/95 px-1 py-1 shadow-md backdrop-blur">
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

        {!topicView && selectedIds.size > 0 && !tagModalOpen && (
          <div className="absolute top-3 left-1/2 z-40 -translate-x-1/2 transform">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface/95 px-4 py-2 shadow-md backdrop-blur">
              <span className="text-xs text-foreground">
                {selectedIds.size} selected
              </span>
              <button
                onClick={() => setTagModalOpen(true)}
                className="rounded px-2 py-1 text-xs font-medium text-white"
                style={{ backgroundColor: 'var(--accent-blue)' }}
              >
                Tag as topic
              </button>
              <button
                onClick={deleteSelected}
                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
              >
                Delete
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="rounded px-2 py-1 text-xs font-medium text-muted-fg hover:text-foreground"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {topicView && (
          <div className="absolute top-3 left-1/2 z-40 -translate-x-1/2 transform">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface/95 px-4 py-2 shadow-md backdrop-blur">
              <span className="text-xs text-foreground">
                Previewing <strong>{topicView.tagName}</strong>
                {' · '}
                <span className="text-muted-fg">{topicView.target.size} notes</span>
              </span>
              <button
                onClick={keepTopicArrangement}
                disabled={savingTopic}
                className="rounded px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: 'var(--accent-blue)' }}
              >
                {savingTopic ? 'Saving…' : 'Keep arrangement'}
              </button>
              <button
                onClick={cancelTopicView}
                className="rounded px-2 py-1 text-xs font-medium text-muted-fg hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {tagModalOpen && (
          <TagSelectModal
            availableTags={allTags}
            count={selectedIds.size}
            onCancel={() => {
              setTagModalOpen(false)
              setSelectedIds(new Set())
            }}
            onConfirm={confirmTagSelection}
          />
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

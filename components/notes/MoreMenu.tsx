'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  onTrash: () => void
  /** Adds extra spacing class to the trigger — useful in compact toolbars. */
  className?: string
}

const MENU_W = 184
const MENU_GAP = 4
const CONFIRM_TIMEOUT_MS = 3000

// Overflow ⋮ menu containing destructive actions. Portal-rendered so it
// escapes any overflow:hidden or CSS transform on its ancestors (the board is
// transformed for zoom and the card has overflow:hidden for content clipping).
export function MoreMenu({ onTrash, className }: Props) {
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const armTimeout = useRef<number | null>(null)

  function close() {
    setOpen(false)
    setArmed(false)
    if (armTimeout.current) {
      window.clearTimeout(armTimeout.current)
      armTimeout.current = null
    }
  }

  // Compute menu position from the trigger button. Flip above if the menu
  // would clip the bottom of the viewport.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const menuH = menuRef.current?.offsetHeight ?? 60
    const right = rect.right
    const below = rect.bottom + MENU_GAP
    const above = rect.top - MENU_GAP - menuH
    const top = below + menuH > window.innerHeight && above > 0 ? above : below
    setPos({ left: right - MENU_W, top })
  }, [open])

  // Outside click / scroll / Escape closes the menu.
  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      const t = e.target as Node
      if (
        triggerRef.current?.contains(t) ||
        menuRef.current?.contains(t)
      ) return
      close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    function onScroll() {
      close()
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (armTimeout.current) window.clearTimeout(armTimeout.current)
    }
  }, [])

  function handleTrashClick() {
    if (!armed) {
      setArmed(true)
      armTimeout.current = window.setTimeout(() => setArmed(false), CONFIRM_TIMEOUT_MS)
      return
    }
    if (armTimeout.current) window.clearTimeout(armTimeout.current)
    close()
    onTrash()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="More actions"
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation()
          setOpen(o => !o)
          setArmed(false)
        }}
        className={`rounded p-0.5 text-neutral-600 hover:bg-black/10 ${className ?? ''}`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="8" cy="13" r="1.4" />
        </svg>
      </button>

      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            // pointerdown bubbles to the document handler — keep clicks on the
            // menu from being treated as outside clicks.
            onPointerDown={e => e.stopPropagation()}
            style={{ position: 'fixed', left: pos.left, top: pos.top, width: MENU_W }}
            className="z-[10000] rounded-md border border-border bg-surface p-1 text-sm text-foreground shadow-lg"
          >
            <button
              role="menuitem"
              type="button"
              onClick={e => {
                e.stopPropagation()
                handleTrashClick()
              }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                armed
                  ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                  : 'text-foreground hover:bg-surface-hover'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 4h11M6 4V2.5h4V4M5 4l.5 9h5L11 4" />
              </svg>
              <span className="flex-1 text-xs">
                {armed ? 'Click again to confirm' : 'Move to trash'}
              </span>
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}

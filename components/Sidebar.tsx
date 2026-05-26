'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOutAction } from '@/lib/actions/auth'
import { deleteTag, updateTagColor } from '@/lib/actions/tags'
import { NOTE_COLOR_KEYS, NOTE_SWATCHES } from '@/lib/note-colors'
import type { Folder, Tag } from '@/lib/db/schema'

interface Props {
  folders: Folder[]
  tags:    Tag[]
  isAdmin: boolean
}

export function Sidebar({ folders, tags, isAdmin }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [openColorId, setOpenColorId] = useState<string | null>(null)
  const colorPopoverRef = useRef<HTMLDivElement | null>(null)

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  async function handleDeleteTag(tag: Tag) {
    if (!confirm(`Delete topic "${tag.name}"? Notes themselves stay; they just lose this topic.`)) return
    await deleteTag(tag.id)
    router.refresh()
  }

  async function handlePickColor(tagId: string, color: string | null) {
    setOpenColorId(null)
    await updateTagColor(tagId, color)
    router.refresh()
  }

  useEffect(() => {
    if (!openColorId) return
    function onDown(e: PointerEvent) {
      if (colorPopoverRef.current && !colorPopoverRef.current.contains(e.target as Node)) {
        setOpenColorId(null)
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [openColorId])

  const navLink = (href: string, label: string) => (
    <Link
      href={href}
      className={`text-sm rounded-md px-2 py-1.5 transition-colors ${
        isActive(href)
          ? 'bg-surface-hover text-foreground font-medium'
          : 'text-muted-fg hover:text-foreground hover:bg-surface-hover'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <aside className="w-60 shrink-0 border-r border-border flex flex-col h-full">
      <nav className="flex flex-col gap-0.5 p-2 flex-1 overflow-y-auto">
        {navLink('/notes', 'All Notes')}
        {navLink('/vault', 'Vault')}

        {folders.length > 0 && (
          <div className="mt-3">
            <p className="px-2 py-1 text-xs font-medium text-muted-fg uppercase tracking-wide">
              Folders
            </p>
            {folders.map(f => (
              <Link
                key={f.id}
                href={`/folders/${f.id}`}
                className={`text-sm rounded-md px-2 py-1.5 transition-colors flex items-center gap-1.5 ${
                  isActive(`/folders/${f.id}`)
                    ? 'bg-surface-hover text-foreground font-medium'
                    : 'text-muted-fg hover:text-foreground hover:bg-surface-hover'
                }`}
              >
                <span>{f.name}</span>
              </Link>
            ))}
          </div>
        )}

        {tags.length > 0 && (
          <div className="mt-3">
            <p className="px-2 py-1 text-xs font-medium text-muted-fg uppercase tracking-wide">
              Topics
            </p>
            {tags.map(t => (
              <div
                key={t.id}
                className="group relative flex items-center gap-0.5 pr-1"
              >
                <button
                  type="button"
                  onClick={() => setOpenColorId(prev => (prev === t.id ? null : t.id))}
                  aria-label={`Change color for topic ${t.name}`}
                  title="Change color"
                  className={`ml-1 h-3 w-3 shrink-0 rounded-full border ${
                    t.color
                      ? `${NOTE_SWATCHES[t.color] ?? ''} border-transparent`
                      : 'border-neutral-500/40 bg-transparent'
                  }`}
                />
                {openColorId === t.id && (
                  <div
                    ref={colorPopoverRef}
                    className="absolute left-0 top-full z-50 mt-1 flex items-center gap-1 rounded-md border border-border bg-surface p-1.5 shadow-lg"
                  >
                    <button
                      type="button"
                      onClick={() => handlePickColor(t.id, null)}
                      aria-label="No color"
                      title="No color"
                      className={`h-4 w-4 rounded-full border border-neutral-300 bg-transparent ${
                        !t.color ? 'ring-2 ring-foreground ring-offset-1' : ''
                      }`}
                    />
                    {NOTE_COLOR_KEYS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handlePickColor(t.id, c)}
                        aria-label={`Color ${c}`}
                        title={c}
                        className={`h-4 w-4 rounded-full ${NOTE_SWATCHES[c]} ${
                          t.color === c ? 'ring-2 ring-foreground ring-offset-1' : ''
                        }`}
                      />
                    ))}
                  </div>
                )}
                <Link
                  href={`/notes?select=${t.id}`}
                  scroll={false}
                  title={`Focus notes tagged "${t.name}"`}
                  className="flex-1 text-sm rounded-md px-2 py-1.5 transition-colors flex items-center gap-1.5 min-w-0 text-muted-fg hover:text-foreground hover:bg-surface-hover"
                >
                  <span className="truncate">{t.name}</span>
                </Link>
                <Link
                  href={`/notes?topic=${t.id}`}
                  scroll={false}
                  title={`Gather notes tagged "${t.name}" around the viewport`}
                  aria-label={`Gather notes tagged ${t.name}`}
                  className="shrink-0 rounded p-1 text-muted-fg opacity-0 group-hover:opacity-100 hover:bg-surface-hover hover:text-foreground focus:opacity-100 transition-opacity"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <circle cx="8" cy="8" r="2.5" />
                    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" />
                  </svg>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDeleteTag(t)}
                  title={`Delete topic "${t.name}"`}
                  aria-label={`Delete topic ${t.name}`}
                  className="shrink-0 rounded p-1 text-muted-fg opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-surface-hover hover:text-foreground transition-opacity"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M3 3l10 10M13 3L3 13" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-border p-2">
        {isAdmin && navLink('/settings/users', 'User accounts')}
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-fg transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}

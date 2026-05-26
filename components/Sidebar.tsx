'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOutAction } from '@/lib/actions/auth'
import type { Folder, Tag } from '@/lib/db/schema'

interface Props {
  folders: Folder[]
  tags:    Tag[]
  isAdmin: boolean
}

export function Sidebar({ folders, tags, isAdmin }: Props) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

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
                className="group flex items-center gap-0.5 pr-1"
              >
                <Link
                  href={`/notes?select=${t.id}`}
                  scroll={false}
                  title={`Focus notes tagged "${t.name}"`}
                  className="flex-1 text-sm rounded-md px-2 py-1.5 transition-colors flex items-center gap-1.5 min-w-0 text-muted-fg hover:text-foreground hover:bg-surface-hover"
                >
                  {t.color && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                  )}
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

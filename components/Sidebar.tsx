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
      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-2 flex-1 overflow-y-auto">
        {navLink('/notes', 'All Notes')}
        {navLink('/vault', 'Vault')}

        {/* Folders */}
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

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mt-3">
            <p className="px-2 py-1 text-xs font-medium text-muted-fg uppercase tracking-wide">
              Tags
            </p>
            {tags.map(t => (
              <Link
                key={t.id}
                href={`/tags/${t.id}`}
                className={`text-sm rounded-md px-2 py-1.5 transition-colors flex items-center gap-1.5 ${
                  isActive(`/tags/${t.id}`)
                    ? 'bg-surface-hover text-foreground font-medium'
                    : 'text-muted-fg hover:text-foreground hover:bg-surface-hover'
                }`}
              >
                {t.color && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: t.color }}
                  />
                )}
                <span>{t.name}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Footer */}
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

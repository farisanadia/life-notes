'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'
import { signOutAction } from '@/lib/actions/auth'

export function Sidebar() {
  const pathname = usePathname()

  const navItem = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(href + '/')
    return (
      <Link
        href={href}
        className={`text-sm rounded-md px-2 py-1.5 transition-colors ${
          active
            ? 'bg-surface-hover text-foreground font-medium'
            : 'text-muted-fg hover:text-foreground hover:bg-surface-hover'
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <aside className="w-60 shrink-0 border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">Life Notes</span>
        <ThemeToggle />
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-2 flex-1">
        {navItem('/notes', 'All Notes')}
        {navItem('/vault', 'Vault')}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-border">
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full text-left text-sm text-muted-fg hover:text-foreground hover:bg-surface-hover rounded-md px-2 py-1.5 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}

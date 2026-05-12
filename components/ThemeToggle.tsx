'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

const icons: Record<Theme, string> = {
  light:  '☀️',
  dark:   '🌙',
  system: '💻',
}

const labels: Record<Theme, string> = {
  light:  'Light',
  dark:   'Dark',
  system: 'System',
}

const cycle: Record<Theme, Theme> = {
  light:  'dark',
  dark:   'system',
  system: 'light',
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <button className="w-8 h-8 rounded-md opacity-0" aria-hidden />
  }

  const current = (theme ?? 'system') as Theme
  const next = cycle[current]

  return (
    <button
      onClick={() => setTheme(next)}
      title={`${labels[current]} — click for ${labels[next]}`}
      className="w-8 h-8 flex items-center justify-center rounded-md text-sm hover:bg-surface-hover transition-colors"
    >
      {icons[current]}
    </button>
  )
}

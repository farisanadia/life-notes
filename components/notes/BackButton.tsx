'use client'

import { useRouter } from 'next/navigation'

export function BackButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => router.push('/notes')}
      className="text-muted-fg hover:text-foreground hover:bg-surface-hover rounded p-1 transition-colors"
      aria-label="Back to notes"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 3L5 8l5 5" />
      </svg>
    </button>
  )
}

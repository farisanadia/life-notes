'use client'

import { useState, useTransition } from 'react'
import { deleteUserAction } from '@/lib/actions/users'

interface Props {
  id: string
  username: string
}

// Two-click delete: first click arms the button, second deletes. Cards trash
// via drag-to-zone instead, but for user accounts the action has no obvious
// drag target so we keep the explicit confirm.
const ARM_TIMEOUT_MS = 3000

export function DeleteUserButton({ id, username }: Props) {
  const [armed, setArmed] = useState(false)
  const [pending, startTransition] = useTransition()

  function arm() {
    setArmed(true)
    window.setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
  }

  function confirmDelete() {
    startTransition(async () => {
      try {
        await deleteUserAction(id)
      } catch {
        // Re-arm on failure so the user can retry; the action server-throws
        // for things like attempting to delete the admin row.
        setArmed(false)
      }
    })
  }

  if (!armed) {
    return (
      <button
        onClick={arm}
        aria-label={`Delete ${username}`}
        className="rounded-md border border-border px-2 py-1 text-xs text-muted-fg hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
      >
        Delete
      </button>
    )
  }

  return (
    <button
      onClick={confirmDelete}
      disabled={pending}
      aria-label={`Confirm delete ${username}`}
      className="rounded-md border border-red-500/50 bg-red-500/15 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 disabled:opacity-50"
    >
      {pending ? 'Deleting…' : 'Click again to confirm'}
    </button>
  )
}

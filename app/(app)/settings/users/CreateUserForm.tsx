'use client'

import { useActionState } from 'react'
import { createUserAction, type CreateUserState } from '@/lib/actions/users'

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState<CreateUserState, FormData>(
    createUserAction,
    undefined,
  )

  const error   = state && 'error'   in state ? state.error   : null
  const success = state && 'success' in state ? state.success : null
  const defaultUsername = state && 'username' in state ? state.username : ''

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="new-username" className="text-xs font-medium text-foreground">
          Username
        </label>
        <input
          id="new-username"
          name="username"
          type="text"
          required
          minLength={3}
          maxLength={32}
          autoComplete="off"
          defaultValue={defaultUsername ?? ''}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-foreground/20"
        />
        <p className="text-[11px] text-muted-fg">
          3–32 chars; letters, numbers, dashes, underscores. Stored lowercase.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="new-password" className="text-xs font-medium text-foreground">
          Password
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-foreground/20"
        />
        <p className="text-[11px] text-muted-fg">At least 8 characters.</p>
      </div>

      {error   && <p className="text-sm text-red-500">{error}</p>}
      {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? 'Creating…' : 'Create account'}
      </button>
    </form>
  )
}

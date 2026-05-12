'use client'

import { useActionState } from 'react'
import { loginAction } from '@/lib/actions/auth'

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-1">
        <label htmlFor="username" className="text-sm font-medium text-foreground">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          defaultValue={state?.username ?? ''}
          className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-foreground/20 transition-shadow"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-foreground/20 transition-shadow"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-500">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

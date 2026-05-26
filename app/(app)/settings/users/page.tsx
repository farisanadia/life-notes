import { notFound } from 'next/navigation'
import { ADMIN_USER_ID, requireAdminAuth } from '@/lib/auth-guard'
import { db } from '@/lib/db/index'
import { users } from '@/lib/db/schema'
import { CreateUserForm } from './CreateUserForm'
import { DeleteUserButton } from './DeleteUserButton'

export const metadata = {
  title: 'User accounts — Life Notes',
}

export default async function UsersSettingsPage() {
  // 404 for non-admins so we don't leak the existence of the admin page.
  try {
    await requireAdminAuth()
  } catch {
    notFound()
  }

  const accounts = await db
    .select({
      id:        users.id,
      username:  users.username,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">User accounts</h1>
        <p className="mt-1 text-xs text-muted-fg">
          Only the admin can create or remove accounts. Each account&rsquo;s notes are
          isolated; one user can never read another&rsquo;s data.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <section className="mb-8 max-w-md">
          <h2 className="mb-3 text-sm font-medium text-foreground">Create account</h2>
          <CreateUserForm />
        </section>

        <section className="max-w-2xl">
          <h2 className="mb-3 text-sm font-medium text-foreground">
            Existing accounts ({accounts.length})
          </h2>
          <ul className="divide-y divide-border rounded-md border border-border">
            {accounts.map(u => {
              const isAdmin = u.id === ADMIN_USER_ID
              return (
                <li key={u.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {u.username}
                      {isAdmin && (
                        <span className="ml-2 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-fg">
                          Admin
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-fg">
                      Joined{' '}
                      {new Date(u.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </span>
                  </div>
                  {!isAdmin && <DeleteUserButton id={u.id} username={u.username} />}
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}

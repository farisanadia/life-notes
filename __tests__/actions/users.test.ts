import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth-guard', () => ({
  ADMIN_USER_ID: 'admin',
  requireAdmin: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'HASHED') } }))

const { mockChain, mockSelectChain } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    values:    vi.fn(),
    set:       vi.fn(),
    where:     vi.fn(),
    returning: vi.fn(),
  }
  for (const key of Object.keys(chain)) chain[key].mockReturnValue(chain)

  // db.select().from().orderBy() chain
  const selectChain: Record<string, ReturnType<typeof vi.fn>> = {
    from:    vi.fn(),
    orderBy: vi.fn(),
  }
  selectChain.from.mockReturnValue(selectChain)
  selectChain.orderBy.mockResolvedValue([])

  return { mockChain: chain, mockSelectChain: selectChain }
})

vi.mock('@/lib/db/index', () => ({
  db: {
    insert: vi.fn(() => mockChain),
    delete: vi.fn(() => mockChain),
    select: vi.fn(() => mockSelectChain),
  },
}))
vi.mock('@/lib/db/schema', () => ({
  users:        { id: 'id-col' },
  notes:        { userId: 'notes-userId' },
  folders:      { userId: 'folders-userId' },
  tags:         { userId: 'tags-userId' },
  vaultEntries: { userId: 'vault-userId' },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }))

import {
  createUserAction,
  listUsers,
  deleteUserAction,
} from '@/lib/actions/users'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/index'
import bcrypt from 'bcryptjs'

const mockRequireAdmin = vi.mocked(requireAdmin)
const mockRevalidate   = vi.mocked(revalidatePath)
const mockInsert       = vi.mocked(db.insert)
const mockDelete       = vi.mocked(db.delete)
const mockBcryptHash   = vi.mocked(bcrypt.hash)

const ADMIN_ID = 'admin'

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAdmin.mockResolvedValue(ADMIN_ID)
  for (const key of Object.keys(mockChain)) mockChain[key].mockReturnValue(mockChain)
  mockSelectChain.from.mockReturnValue(mockSelectChain)
  mockSelectChain.orderBy.mockResolvedValue([])
  mockBcryptHash.mockResolvedValue('HASHED' as never)
  delete process.env.ADMIN_USERNAME
})

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

// ── createUserAction ──────────────────────────────────────────────────────────

describe('createUserAction', () => {
  it('requires admin', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('Forbidden'))
    await expect(
      createUserAction(undefined, form({ username: 'alice', password: 'longpassword' })),
    ).rejects.toThrow('Forbidden')
  })

  it('rejects usernames shorter than 3 chars', async () => {
    const r = await createUserAction(undefined, form({ username: 'ab', password: 'longpassword' }))
    expect(r).toEqual({ error: expect.stringContaining('3–32'), username: 'ab' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects usernames longer than 32 chars', async () => {
    const long = 'a'.repeat(33)
    const r = await createUserAction(undefined, form({ username: long, password: 'longpassword' }))
    expect(r).toEqual({ error: expect.stringContaining('3–32'), username: long })
  })

  it('rejects usernames with disallowed characters', async () => {
    const r = await createUserAction(undefined, form({ username: 'alice!', password: 'longpassword' }))
    expect(r).toEqual({ error: expect.stringContaining('letters, numbers'), username: 'alice!' })
  })

  it('rejects passwords shorter than 8 chars', async () => {
    const r = await createUserAction(undefined, form({ username: 'alice', password: 'short' }))
    expect(r).toEqual({ error: expect.stringContaining('8 characters'), username: 'alice' })
  })

  it('reserves the env admin username (case-insensitive)', async () => {
    process.env.ADMIN_USERNAME = 'Farisa'
    const r = await createUserAction(undefined, form({ username: 'FARISA', password: 'longpassword' }))
    expect(r).toEqual({ error: expect.stringContaining('reserved'), username: 'FARISA' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('inserts a lowercased username and bcrypt-hashed password', async () => {
    await createUserAction(undefined, form({ username: 'Alice', password: 'longpassword' }))
    expect(mockBcryptHash).toHaveBeenCalledWith('longpassword', 12)
    expect(mockChain.values).toHaveBeenCalledWith({ username: 'alice', passwordHash: 'HASHED' })
  })

  it('returns success message on insert', async () => {
    const r = await createUserAction(undefined, form({ username: 'alice', password: 'longpassword' }))
    expect(r).toEqual({ success: expect.stringContaining('alice') })
    expect(mockRevalidate).toHaveBeenCalledWith('/settings/users')
  })

  it('reports a unique violation as a friendly error', async () => {
    mockChain.values.mockImplementation(() => {
      const err = new Error('duplicate key value') as Error & { code: string }
      err.code = '23505'
      throw err
    })
    const r = await createUserAction(undefined, form({ username: 'alice', password: 'longpassword' }))
    expect(r).toEqual({ error: expect.stringContaining('already taken'), username: 'alice' })
  })

  it('rethrows unexpected DB errors', async () => {
    mockChain.values.mockImplementation(() => {
      throw new Error('boom')
    })
    await expect(
      createUserAction(undefined, form({ username: 'alice', password: 'longpassword' })),
    ).rejects.toThrow('boom')
  })
})

// ── listUsers ─────────────────────────────────────────────────────────────────

describe('listUsers', () => {
  it('requires admin', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('Forbidden'))
    await expect(listUsers()).rejects.toThrow('Forbidden')
  })

  it('returns the rows from the DB query', async () => {
    const rows = [{ id: 'admin', username: 'farisa', createdAt: new Date() }]
    mockSelectChain.orderBy.mockResolvedValueOnce(rows)
    await expect(listUsers()).resolves.toEqual(rows)
  })
})

// ── deleteUserAction ──────────────────────────────────────────────────────────

describe('deleteUserAction', () => {
  it('requires admin', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('Forbidden'))
    await expect(deleteUserAction('user-1')).rejects.toThrow('Forbidden')
  })

  it('refuses to delete the admin row', async () => {
    await expect(deleteUserAction('admin')).rejects.toThrow(/admin account cannot be deleted/i)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('deletes a non-admin user and revalidates the settings page', async () => {
    await deleteUserAction('user-1')
    // notes, tags, folders, vaultEntries, users — 5 delete calls
    expect(mockDelete).toHaveBeenCalledTimes(5)
    expect(mockRevalidate).toHaveBeenCalledWith('/settings/users')
  })
})

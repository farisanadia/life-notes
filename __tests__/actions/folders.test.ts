import { describe, it, expect, vi, beforeEach } from 'vitest'


vi.mock('@/lib/auth-guard', () => ({ requireAuthStrict: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { mockChain } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    values:    vi.fn(),
    set:       vi.fn(),
    where:     vi.fn(),
    returning: vi.fn(),
  }
  for (const key of Object.keys(chain)) {
    chain[key].mockReturnValue(chain)
  }
  return { mockChain: chain }
})

vi.mock('@/lib/db/index', () => ({
  db: {
    insert: vi.fn(() => mockChain),
    update: vi.fn(() => mockChain),
    delete: vi.fn(() => mockChain),
  },
}))

vi.mock('@/lib/db/schema', () => ({ folders: {} }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }))

import { createFolder, renameFolder, deleteFolder } from '@/lib/actions/folders'
import { requireAuthStrict } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'

const mockRequireAuthStrict = vi.mocked(requireAuthStrict)
const mockRevalidate  = vi.mocked(revalidatePath)
const mockInsert      = vi.mocked(db.insert)
const mockDelete      = vi.mocked(db.delete)

const USER_ID    = 'user-123'
const FOLDER_ID  = 'folder-456'
const mockFolder = { id: FOLDER_ID, userId: USER_ID, name: 'My Folder', parentId: null }

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuthStrict.mockResolvedValue(USER_ID)
  for (const key of Object.keys(mockChain)) {
    mockChain[key].mockReturnValue(mockChain)
  }
  mockChain.returning.mockResolvedValue([mockFolder])
})

// ── createFolder ──────────────────────────────────────────────────────────────

describe('createFolder', () => {
  it('requires authentication', async () => {
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
    await expect(createFolder('Work')).rejects.toThrow('Unauthorized')
  })

  it('inserts with the authenticated userId and provided name', async () => {
    await createFolder('Work')
    expect(mockInsert).toHaveBeenCalledOnce()
    expect(mockChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, name: 'Work' }),
    )
  })

  it('inserts with null parentId when none provided', async () => {
    await createFolder('Work')
    expect(mockChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: null }),
    )
  })

  it('inserts with the given parentId', async () => {
    await createFolder('Sub', 'parent-1')
    expect(mockChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'parent-1' }),
    )
  })

  it('returns the created folder', async () => {
    const result = await createFolder('Work')
    expect(result).toEqual(mockFolder)
  })

  it('revalidates /notes', async () => {
    await createFolder('Work')
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

// ── renameFolder ──────────────────────────────────────────────────────────────

describe('renameFolder', () => {
  it('requires authentication', async () => {
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
    await expect(renameFolder(FOLDER_ID, 'New')).rejects.toThrow('Unauthorized')
  })

  it('updates the folder name', async () => {
    await renameFolder(FOLDER_ID, 'New Name')
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Name' }),
    )
  })

  it('always sets updatedAt', async () => {
    await renameFolder(FOLDER_ID, 'New Name')
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAt: expect.any(Date) }),
    )
  })

  it('throws when the folder is not found', async () => {
    mockChain.returning.mockResolvedValue([])
    await expect(renameFolder(FOLDER_ID, 'x')).rejects.toThrow('Folder not found')
  })

  it('returns the updated folder', async () => {
    const result = await renameFolder(FOLDER_ID, 'New Name')
    expect(result).toEqual(mockFolder)
  })

  it('revalidates /notes', async () => {
    await renameFolder(FOLDER_ID, 'New Name')
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

// ── deleteFolder ──────────────────────────────────────────────────────────────

describe('deleteFolder', () => {
  it('requires authentication', async () => {
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
    await expect(deleteFolder(FOLDER_ID)).rejects.toThrow('Unauthorized')
  })

  it('deletes the folder', async () => {
    await deleteFolder(FOLDER_ID)
    expect(mockDelete).toHaveBeenCalledOnce()
  })

  it('revalidates /notes', async () => {
    await deleteFolder(FOLDER_ID)
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

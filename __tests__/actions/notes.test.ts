import { describe, it, expect, vi, beforeEach } from 'vitest'


// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth-guard', () => ({ requireAuth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { mockChain } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    values:    vi.fn(),
    set:       vi.fn(),
    where:     vi.fn(),
    returning: vi.fn(),
  }
  // Make every method return the chain so calls can be chained
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

vi.mock('@/lib/db/schema', () => ({ notes: {} }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }))

import {
  createNote, updateNote, trashNote, restoreNote,
  deleteNote, pinNote, moveNote,
} from '@/lib/actions/notes'
import { requireAuth } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'

const mockRequireAuth   = vi.mocked(requireAuth)
const mockRevalidate    = vi.mocked(revalidatePath)
const mockInsert        = vi.mocked(db.insert)
const mockUpdate        = vi.mocked(db.update)
const mockDelete        = vi.mocked(db.delete)

const USER_ID  = 'user-123'
const NOTE_ID  = 'note-456'
const mockNote = { id: NOTE_ID, userId: USER_ID, title: 'Test', content: '' }

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue(USER_ID)
  // Restore chain behaviour for all methods
  for (const key of Object.keys(mockChain)) {
    mockChain[key].mockReturnValue(mockChain)
  }
  // returning() resolves to a single-item array
  mockChain.returning.mockResolvedValue([mockNote])
})

// ── createNote ────────────────────────────────────────────────────────────────

describe('createNote', () => {
  it('requires authentication', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'))
    await expect(createNote()).rejects.toThrow('Unauthorized')
  })

  it('inserts a note with the authenticated userId', async () => {
    await createNote()
    expect(mockInsert).toHaveBeenCalledOnce()
    expect(mockChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
    )
  })

  it('inserts with null folderId when none provided', async () => {
    await createNote()
    expect(mockChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: null }),
    )
  })

  it('inserts with the given folderId', async () => {
    await createNote('folder-1')
    expect(mockChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: 'folder-1' }),
    )
  })

  it('returns the created note', async () => {
    const result = await createNote()
    expect(result).toEqual(mockNote)
  })

  it('revalidates /notes', async () => {
    await createNote()
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

// ── updateNote ────────────────────────────────────────────────────────────────

describe('updateNote', () => {
  it('requires authentication', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'))
    await expect(updateNote(NOTE_ID, { title: 'x' })).rejects.toThrow('Unauthorized')
  })

  it('updates with the provided fields', async () => {
    await updateNote(NOTE_ID, { title: 'New title', content: 'body' })
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New title', content: 'body' }),
    )
  })

  it('always sets updatedAt', async () => {
    await updateNote(NOTE_ID, { title: 'x' })
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAt: expect.any(Date) }),
    )
  })

  it('throws when the note is not found (wrong user or missing)', async () => {
    mockChain.returning.mockResolvedValue([])
    await expect(updateNote(NOTE_ID, { title: 'x' })).rejects.toThrow('Note not found')
  })

  it('returns the updated note', async () => {
    const result = await updateNote(NOTE_ID, { title: 'x' })
    expect(result).toEqual(mockNote)
  })

  it('revalidates /notes and the note path', async () => {
    await updateNote(NOTE_ID, { title: 'x' })
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
    expect(mockRevalidate).toHaveBeenCalledWith(`/notes/${NOTE_ID}`)
  })
})

// ── trashNote ─────────────────────────────────────────────────────────────────

describe('trashNote', () => {
  it('requires authentication', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'))
    await expect(trashNote(NOTE_ID)).rejects.toThrow('Unauthorized')
  })

  it('sets isTrashed to true', async () => {
    await trashNote(NOTE_ID)
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ isTrashed: true }),
    )
  })

  it('revalidates /notes and the note path', async () => {
    await trashNote(NOTE_ID)
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
    expect(mockRevalidate).toHaveBeenCalledWith(`/notes/${NOTE_ID}`)
  })
})

// ── restoreNote ───────────────────────────────────────────────────────────────

describe('restoreNote', () => {
  it('requires authentication', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'))
    await expect(restoreNote(NOTE_ID)).rejects.toThrow('Unauthorized')
  })

  it('sets isTrashed to false', async () => {
    await restoreNote(NOTE_ID)
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ isTrashed: false }),
    )
  })

  it('revalidates /notes', async () => {
    await restoreNote(NOTE_ID)
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

// ── deleteNote ────────────────────────────────────────────────────────────────

describe('deleteNote', () => {
  it('requires authentication', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'))
    await expect(deleteNote(NOTE_ID)).rejects.toThrow('Unauthorized')
  })

  it('deletes the note', async () => {
    await deleteNote(NOTE_ID)
    expect(mockDelete).toHaveBeenCalledOnce()
  })

  it('revalidates /notes', async () => {
    await deleteNote(NOTE_ID)
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

// ── pinNote ───────────────────────────────────────────────────────────────────

describe('pinNote', () => {
  it('requires authentication', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'))
    await expect(pinNote(NOTE_ID, true)).rejects.toThrow('Unauthorized')
  })

  it('sets isPinned to true', async () => {
    await pinNote(NOTE_ID, true)
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ isPinned: true }),
    )
  })

  it('sets isPinned to false', async () => {
    await pinNote(NOTE_ID, false)
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ isPinned: false }),
    )
  })

  it('revalidates /notes', async () => {
    await pinNote(NOTE_ID, true)
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

// ── moveNote ──────────────────────────────────────────────────────────────────

describe('moveNote', () => {
  it('requires authentication', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'))
    await expect(moveNote(NOTE_ID, 'folder-1')).rejects.toThrow('Unauthorized')
  })

  it('sets the folderId', async () => {
    await moveNote(NOTE_ID, 'folder-1')
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: 'folder-1' }),
    )
  })

  it('accepts null to remove from folder', async () => {
    await moveNote(NOTE_ID, null)
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: null }),
    )
  })

  it('revalidates /notes', async () => {
    await moveNote(NOTE_ID, 'folder-1')
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

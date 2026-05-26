import { describe, it, expect, vi, beforeEach } from 'vitest'


// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth-guard', () => ({ requireAuthStrict: vi.fn() }))
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
  updateNotePosition, updateNotePositions,
  updateNoteColor, updateNoteSize,
  updateNoteZIndex, setNoteCollapsed,
} from '@/lib/actions/notes'
import { requireAuthStrict } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'

const mockRequireAuthStrict   = vi.mocked(requireAuthStrict)
const mockRevalidate    = vi.mocked(revalidatePath)
const mockInsert        = vi.mocked(db.insert)
const mockUpdate        = vi.mocked(db.update)
const mockDelete        = vi.mocked(db.delete)

const USER_ID  = 'user-123'
const NOTE_ID  = 'note-456'
const mockNote = { id: NOTE_ID, userId: USER_ID, title: 'Test', content: '' }

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuthStrict.mockResolvedValue(USER_ID)
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
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
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
    await createNote({ folderId: 'folder-1' })
    expect(mockChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: 'folder-1' }),
    )
  })

  it('inserts at the given rounded position', async () => {
    await createNote({ positionX: 120.7, positionY: 80.2 })
    expect(mockChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ positionX: 121, positionY: 80 }),
    )
  })

  it('inserts with the given rounded zIndex', async () => {
    await createNote({ zIndex: 5.7 })
    expect(mockChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ zIndex: 6 }),
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
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
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
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
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
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
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
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
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
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
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
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
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

// ── updateNotePosition ────────────────────────────────────────────────────────

describe('updateNotePosition', () => {
  it('requires authentication', async () => {
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
    await expect(updateNotePosition(NOTE_ID, 10, 20)).rejects.toThrow('Unauthorized')
  })

  it('sets rounded x and y coordinates', async () => {
    await updateNotePosition(NOTE_ID, 10.6, 20.2)
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ positionX: 11, positionY: 20 }),
    )
  })

  it('revalidates /notes', async () => {
    await updateNotePosition(NOTE_ID, 10, 20)
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

// ── updateNotePositions ───────────────────────────────────────────────────────

describe('updateNotePositions', () => {
  it('requires authentication when there are updates', async () => {
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
    await expect(
      updateNotePositions([{ id: 'a', x: 1, y: 2 }]),
    ).rejects.toThrow('Unauthorized')
  })

  it('no-ops for an empty batch (no auth, no DB, no revalidate)', async () => {
    await updateNotePositions([])
    expect(mockRequireAuthStrict).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it('issues one update per note with rounded coordinates', async () => {
    await updateNotePositions([
      { id: 'a', x: 10.4, y: 20.6 },
      { id: 'b', x: 30.0, y: 40.5 },
    ])
    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(mockChain.set).toHaveBeenNthCalledWith(1, { positionX: 10, positionY: 21 })
    expect(mockChain.set).toHaveBeenNthCalledWith(2, { positionX: 30, positionY: 41 })
  })

  it('revalidates /notes once', async () => {
    await updateNotePositions([{ id: 'a', x: 0, y: 0 }])
    expect(mockRevalidate).toHaveBeenCalledTimes(1)
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

// ── updateNoteColor ───────────────────────────────────────────────────────────

describe('updateNoteColor', () => {
  it('requires authentication', async () => {
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
    await expect(updateNoteColor(NOTE_ID, 'blue')).rejects.toThrow('Unauthorized')
  })

  it('sets the color', async () => {
    await updateNoteColor(NOTE_ID, 'blue')
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'blue' }),
    )
  })

  it('revalidates /notes', async () => {
    await updateNoteColor(NOTE_ID, 'blue')
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

// ── updateNoteSize ────────────────────────────────────────────────────────────

describe('updateNoteSize', () => {
  it('requires authentication', async () => {
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
    await expect(updateNoteSize(NOTE_ID, 300, 200)).rejects.toThrow('Unauthorized')
  })

  it('sets rounded width and height', async () => {
    await updateNoteSize(NOTE_ID, 300.6, 200.3)
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ width: 301, height: 200 }),
    )
  })

  it('revalidates /notes', async () => {
    await updateNoteSize(NOTE_ID, 300, 200)
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

// ── updateNoteZIndex ──────────────────────────────────────────────────────────

describe('updateNoteZIndex', () => {
  it('requires authentication', async () => {
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
    await expect(updateNoteZIndex(NOTE_ID, 5)).rejects.toThrow('Unauthorized')
  })

  it('sets the rounded z-index', async () => {
    await updateNoteZIndex(NOTE_ID, 5.8)
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ zIndex: 6 }),
    )
  })

  it('revalidates /notes', async () => {
    await updateNoteZIndex(NOTE_ID, 5)
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

// ── setNoteCollapsed ──────────────────────────────────────────────────────────

describe('setNoteCollapsed', () => {
  it('requires authentication', async () => {
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
    await expect(setNoteCollapsed(NOTE_ID, true)).rejects.toThrow('Unauthorized')
  })

  it('sets isCollapsed', async () => {
    await setNoteCollapsed(NOTE_ID, true)
    expect(mockChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ isCollapsed: true }),
    )
  })

  it('revalidates /notes', async () => {
    await setNoteCollapsed(NOTE_ID, false)
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

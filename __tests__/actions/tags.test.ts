import { describe, it, expect, vi, beforeEach } from 'vitest'


vi.mock('@/lib/auth-guard', () => ({ requireAuthStrict: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { mockChain } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    values:            vi.fn(),
    set:               vi.fn(),
    where:             vi.fn(),
    returning:         vi.fn(),
    from:              vi.fn(),
    onConflictDoNothing: vi.fn(),
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
    select: vi.fn(() => mockChain),
  },
}))

vi.mock('@/lib/db/schema', () => ({ tags: {}, noteTags: {}, notes: {} }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }))

import { createTag, deleteTag, tagNote, untagNote } from '@/lib/actions/tags'
import { requireAuthStrict } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'

const mockRequireAuthStrict = vi.mocked(requireAuthStrict)
const mockRevalidate  = vi.mocked(revalidatePath)
const mockInsert      = vi.mocked(db.insert)
const mockDelete      = vi.mocked(db.delete)

const USER_ID = 'user-123'
const NOTE_ID = 'note-456'
const TAG_ID  = 'tag-789'
const mockTag = { id: TAG_ID, userId: USER_ID, name: 'work', color: null }

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuthStrict.mockResolvedValue(USER_ID)
  mockChain.returning.mockResolvedValue([mockTag])
  mockChain.where.mockResolvedValue([{ id: NOTE_ID }])
  mockChain.onConflictDoNothing.mockResolvedValue(undefined)
})

// ── createTag ─────────────────────────────────────────────────────────────────

describe('createTag', () => {
  it('requires authentication', async () => {
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
    await expect(createTag('work')).rejects.toThrow('Unauthorized')
  })

  it('inserts with the authenticated userId and provided name', async () => {
    await createTag('work')
    expect(mockInsert).toHaveBeenCalledOnce()
    expect(mockChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, name: 'work' }),
    )
  })

  it('inserts with null color when none provided', async () => {
    await createTag('work')
    expect(mockChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ color: null }),
    )
  })

  it('inserts with the given color', async () => {
    await createTag('work', '#ff0000')
    expect(mockChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ color: '#ff0000' }),
    )
  })

  it('returns the created tag', async () => {
    const result = await createTag('work')
    expect(result).toEqual(mockTag)
  })

  it('revalidates /notes', async () => {
    await createTag('work')
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

// ── deleteTag ─────────────────────────────────────────────────────────────────

describe('deleteTag', () => {
  it('requires authentication', async () => {
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
    await expect(deleteTag(TAG_ID)).rejects.toThrow('Unauthorized')
  })

  it('deletes the tag', async () => {
    await deleteTag(TAG_ID)
    expect(mockDelete).toHaveBeenCalledOnce()
  })

  it('revalidates /notes', async () => {
    await deleteTag(TAG_ID)
    expect(mockRevalidate).toHaveBeenCalledWith('/notes')
  })
})

// ── tagNote ───────────────────────────────────────────────────────────────────

describe('tagNote', () => {
  it('requires authentication', async () => {
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
    await expect(tagNote(NOTE_ID, TAG_ID)).rejects.toThrow('Unauthorized')
  })

  it('throws when the note does not belong to the user', async () => {
    // First select (note lookup) returns empty
    mockChain.where.mockResolvedValueOnce([])
    await expect(tagNote(NOTE_ID, TAG_ID)).rejects.toThrow('Note not found')
  })

  it("throws when the tag does not belong to the user (defense vs cross-user tagging)", async () => {
    // First select (note) succeeds, second (tag) returns empty
    mockChain.where.mockResolvedValueOnce([{ id: NOTE_ID }])
    mockChain.where.mockResolvedValueOnce([])
    await expect(tagNote(NOTE_ID, TAG_ID)).rejects.toThrow('Tag not found')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('inserts the note-tag relationship when both note and tag belong to user', async () => {
    mockChain.where.mockResolvedValueOnce([{ id: NOTE_ID }])
    mockChain.where.mockResolvedValueOnce([{ id: TAG_ID }])
    await tagNote(NOTE_ID, TAG_ID)
    expect(mockInsert).toHaveBeenCalledOnce()
    expect(mockChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: NOTE_ID, tagId: TAG_ID }),
    )
  })

  it('uses onConflictDoNothing (idempotent)', async () => {
    mockChain.where.mockResolvedValueOnce([{ id: NOTE_ID }])
    mockChain.where.mockResolvedValueOnce([{ id: TAG_ID }])
    await tagNote(NOTE_ID, TAG_ID)
    expect(mockChain.onConflictDoNothing).toHaveBeenCalledOnce()
  })

  it('revalidates the note path', async () => {
    mockChain.where.mockResolvedValueOnce([{ id: NOTE_ID }])
    mockChain.where.mockResolvedValueOnce([{ id: TAG_ID }])
    await tagNote(NOTE_ID, TAG_ID)
    expect(mockRevalidate).toHaveBeenCalledWith(`/notes/${NOTE_ID}`)
  })
})

// ── untagNote ─────────────────────────────────────────────────────────────────

describe('untagNote', () => {
  it('requires authentication', async () => {
    mockRequireAuthStrict.mockRejectedValue(new Error('Unauthorized'))
    await expect(untagNote(NOTE_ID, TAG_ID)).rejects.toThrow('Unauthorized')
  })

  it('throws when the note does not belong to the user', async () => {
    mockChain.where.mockResolvedValue([])
    await expect(untagNote(NOTE_ID, TAG_ID)).rejects.toThrow('Note not found')
  })

  it('deletes the note-tag relationship', async () => {
    await untagNote(NOTE_ID, TAG_ID)
    expect(mockDelete).toHaveBeenCalledOnce()
  })

  it('revalidates the note path', async () => {
    await untagNote(NOTE_ID, TAG_ID)
    expect(mockRevalidate).toHaveBeenCalledWith(`/notes/${NOTE_ID}`)
  })
})

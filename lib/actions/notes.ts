'use server'

import { requireAuthStrict } from '@/lib/auth-guard'
import { db } from '@/lib/db/index'
import { notes } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function createNote(opts?: {
  folderId?:  string
  positionX?: number
  positionY?: number
  zIndex?:    number
}) {
  const userId = await requireAuthStrict()

  const [note] = await db
    .insert(notes)
    .values({
      userId,
      folderId:  opts?.folderId ?? null,
      positionX: opts?.positionX != null ? Math.round(opts.positionX) : 40,
      positionY: opts?.positionY != null ? Math.round(opts.positionY) : 40,
      zIndex:    opts?.zIndex    != null ? Math.round(opts.zIndex)    : 0,
    })
    .returning()

  revalidatePath('/notes')
  return note
}

export async function updateNote(
  id: string,
  data: { title?: string; content?: string },
) {
  const userId = await requireAuthStrict()

  const [note] = await db
    .update(notes)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning()

  if (!note) throw new Error('Note not found')

  revalidatePath('/notes')
  revalidatePath(`/notes/${id}`)
  return note
}

export async function trashNote(id: string) {
  const userId = await requireAuthStrict()

  await db
    .update(notes)
    .set({ isTrashed: true, updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
  revalidatePath(`/notes/${id}`)
}

export async function restoreNote(id: string) {
  const userId = await requireAuthStrict()

  await db
    .update(notes)
    .set({ isTrashed: false, updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
}

export async function deleteNote(id: string) {
  const userId = await requireAuthStrict()

  await db
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
}

export async function pinNote(id: string, isPinned: boolean) {
  const userId = await requireAuthStrict()

  await db
    .update(notes)
    .set({ isPinned, updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
}

export async function moveNote(id: string, folderId: string | null) {
  const userId = await requireAuthStrict()

  await db
    .update(notes)
    .set({ folderId, updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
}

export async function updateNotePosition(id: string, x: number, y: number) {
  const userId = await requireAuthStrict()

  await db
    .update(notes)
    .set({ positionX: Math.round(x), positionY: Math.round(y) })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
}

export async function updateNotePositions(
  updates: { id: string; x: number; y: number }[],
) {
  if (updates.length === 0) return
  const userId = await requireAuthStrict()

  await Promise.all(
    updates.map(u =>
      db
        .update(notes)
        .set({ positionX: Math.round(u.x), positionY: Math.round(u.y) })
        .where(and(eq(notes.id, u.id), eq(notes.userId, userId))),
    ),
  )

  revalidatePath('/notes')
}

export async function updateNoteColor(id: string, color: string) {
  const userId = await requireAuthStrict()

  await db
    .update(notes)
    .set({ color })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
}

export async function updateNoteSize(id: string, width: number, height: number) {
  const userId = await requireAuthStrict()

  await db
    .update(notes)
    .set({ width: Math.round(width), height: Math.round(height) })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
}

export async function updateNoteZIndex(id: string, zIndex: number) {
  const userId = await requireAuthStrict()

  await db
    .update(notes)
    .set({ zIndex: Math.round(zIndex) })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
}

export async function setNoteCollapsed(id: string, isCollapsed: boolean) {
  const userId = await requireAuthStrict()

  await db
    .update(notes)
    .set({ isCollapsed })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
}

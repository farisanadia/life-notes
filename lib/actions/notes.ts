'use server'

import { requireAuth } from '@/lib/auth-guard'
import { db } from '@/lib/db/index'
import { notes } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function createNote(folderId?: string) {
  const userId = await requireAuth()

  const [note] = await db
    .insert(notes)
    .values({ userId, folderId: folderId ?? null })
    .returning()

  revalidatePath('/notes')
  return note
}

export async function updateNote(
  id: string,
  data: { title?: string; content?: string },
) {
  const userId = await requireAuth()

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
  const userId = await requireAuth()

  await db
    .update(notes)
    .set({ isTrashed: true, updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
  revalidatePath(`/notes/${id}`)
}

export async function restoreNote(id: string) {
  const userId = await requireAuth()

  await db
    .update(notes)
    .set({ isTrashed: false, updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
}

export async function deleteNote(id: string) {
  const userId = await requireAuth()

  await db
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
}

export async function pinNote(id: string, isPinned: boolean) {
  const userId = await requireAuth()

  await db
    .update(notes)
    .set({ isPinned, updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
}

export async function moveNote(id: string, folderId: string | null) {
  const userId = await requireAuth()

  await db
    .update(notes)
    .set({ folderId, updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))

  revalidatePath('/notes')
}

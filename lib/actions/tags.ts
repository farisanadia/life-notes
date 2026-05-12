'use server'

import { requireAuth } from '@/lib/auth-guard'
import { db } from '@/lib/db/index'
import { tags, noteTags, notes } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function createTag(name: string, color?: string) {
  const userId = await requireAuth()

  const [tag] = await db
    .insert(tags)
    .values({ userId, name, color: color ?? null })
    .returning()

  revalidatePath('/notes')
  return tag
}

export async function deleteTag(id: string) {
  const userId = await requireAuth()

  await db
    .delete(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))

  revalidatePath('/notes')
}

export async function tagNote(noteId: string, tagId: string) {
  const userId = await requireAuth()

  // Verify the note belongs to this user before tagging
  const [note] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))

  if (!note) throw new Error('Note not found')

  await db.insert(noteTags).values({ noteId, tagId }).onConflictDoNothing()

  revalidatePath(`/notes/${noteId}`)
}

export async function untagNote(noteId: string, tagId: string) {
  const userId = await requireAuth()

  // Verify the note belongs to this user before untagging
  const [note] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))

  if (!note) throw new Error('Note not found')

  await db
    .delete(noteTags)
    .where(and(eq(noteTags.noteId, noteId), eq(noteTags.tagId, tagId)))

  revalidatePath(`/notes/${noteId}`)
}

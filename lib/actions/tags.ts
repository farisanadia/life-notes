'use server'

import { requireAuthStrict } from '@/lib/auth-guard'
import { db } from '@/lib/db/index'
import { tags, noteTags, notes } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function createTag(name: string, color?: string) {
  const userId = await requireAuthStrict()

  const [tag] = await db
    .insert(tags)
    .values({ userId, name, color: color ?? null })
    .returning()

  revalidatePath('/notes')
  return tag
}

export async function deleteTag(id: string) {
  const userId = await requireAuthStrict()

  await db
    .delete(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))

  revalidatePath('/notes')
}

export async function tagNote(noteId: string, tagId: string) {
  const userId = await requireAuthStrict()

  // Verify the note belongs to this user before tagging
  const [note] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))

  if (!note) throw new Error('Note not found')

  await db.insert(noteTags).values({ noteId, tagId }).onConflictDoNothing()

  revalidatePath(`/notes/${noteId}`)
}

export async function applyTopicToNotes(input: {
  noteIds: string[]
  tagId?:   string
  tagName?: string
  color?:   string
}) {
  const userId = await requireAuthStrict()
  const { noteIds } = input

  if (noteIds.length === 0) throw new Error('No notes provided')
  if (!input.tagId && !input.tagName) throw new Error('tagId or tagName required')

  const ownedNotes = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.userId, userId), inArray(notes.id, noteIds)))

  if (ownedNotes.length !== noteIds.length) {
    throw new Error('Some notes not found')
  }

  let tagId = input.tagId
  if (tagId) {
    const [tag] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
    if (!tag) throw new Error('Tag not found')
  } else {
    const [tag] = await db
      .insert(tags)
      .values({ userId, name: input.tagName!, color: input.color ?? null })
      .returning()
    tagId = tag.id
  }

  await db
    .insert(noteTags)
    .values(noteIds.map(noteId => ({ noteId, tagId: tagId! })))
    .onConflictDoNothing()

  revalidatePath('/notes')
  return { tagId }
}

export async function untagNote(noteId: string, tagId: string) {
  const userId = await requireAuthStrict()

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

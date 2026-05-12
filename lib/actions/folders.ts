'use server'

import { requireAuthStrict } from '@/lib/auth-guard'
import { db } from '@/lib/db/index'
import { folders } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function createFolder(name: string, parentId?: string) {
  const userId = await requireAuthStrict()

  const [folder] = await db
    .insert(folders)
    .values({ userId, name, parentId: parentId ?? null })
    .returning()

  revalidatePath('/notes')
  return folder
}

export async function renameFolder(id: string, name: string) {
  const userId = await requireAuthStrict()

  const [folder] = await db
    .update(folders)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(folders.id, id), eq(folders.userId, userId)))
    .returning()

  if (!folder) throw new Error('Folder not found')

  revalidatePath('/notes')
  return folder
}

export async function deleteFolder(id: string) {
  const userId = await requireAuthStrict()

  await db
    .delete(folders)
    .where(and(eq(folders.id, id), eq(folders.userId, userId)))

  revalidatePath('/notes')
}

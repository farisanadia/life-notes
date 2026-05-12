import {
  pgTable,
  text,
  boolean,
  timestamp,
  primaryKey,
  unique,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

// ─── Folders ─────────────────────────────────────────────────────────────────

export const folders = pgTable('folders', {
  id:        text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:    text('user_id').notNull(),
  name:      text('name').notNull(),
  parentId:  text('parent_id').references((): AnyPgColumn => folders.id, { onDelete: 'cascade' }),
  color:     text('color'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── Tags ─────────────────────────────────────────────────────────────────────

export const tags = pgTable('tags', {
  id:     text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  name:   text('name').notNull(),
  color:  text('color'),
}, (t) => [
  // Tag names are unique per user, not globally
  unique('tags_user_name_unique').on(t.userId, t.name),
])

// ─── Notes ───────────────────────────────────────────────────────────────────

export const notes = pgTable('notes', {
  id:        text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:    text('user_id').notNull(),
  title:     text('title').notNull().default('Untitled'),
  content:   text('content').notNull().default(''),
  folderId:  text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  isPinned:  boolean('is_pinned').default(false).notNull(),
  isTrashed: boolean('is_trashed').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── Note ↔ Tags (M:N) ───────────────────────────────────────────────────────

export const noteTags = pgTable('note_tags', {
  noteId: text('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  tagId:  text('tag_id').notNull().references(() => tags.id,  { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.noteId, t.tagId] })])

// ─── Vault ───────────────────────────────────────────────────────────────────
// Server stores only opaque ciphertext — plaintext never leaves the browser.

export const vaultEntries = pgTable('vault_entries', {
  id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:        text('user_id').notNull(),
  label:         text('label').notNull(),
  encryptedBlob: text('encrypted_blob').notNull(),
  category:      text('category'),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
  updatedAt:     timestamp('updated_at').defaultNow().notNull(),
})

// ─── Relations ───────────────────────────────────────────────────────────────

export const foldersRelations = relations(folders, ({ one, many }) => ({
  parent:   one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
    relationName: 'folderChildren',
  }),
  children: many(folders, { relationName: 'folderChildren' }),
  notes:    many(notes),
}))

export const notesRelations = relations(notes, ({ one, many }) => ({
  folder:   one(folders, { fields: [notes.folderId], references: [folders.id] }),
  noteTags: many(noteTags),
}))

export const noteTagsRelations = relations(noteTags, ({ one }) => ({
  note: one(notes, { fields: [noteTags.noteId], references: [notes.id] }),
  tag:  one(tags,  { fields: [noteTags.tagId],  references: [tags.id]  }),
}))

export const tagsRelations = relations(tags, ({ many }) => ({
  noteTags: many(noteTags),
}))

// ─── Types ───────────────────────────────────────────────────────────────────

export type Folder      = typeof folders.$inferSelect
export type Note        = typeof notes.$inferSelect
export type Tag         = typeof tags.$inferSelect
export type NoteTag     = typeof noteTags.$inferSelect
export type VaultEntry  = typeof vaultEntries.$inferSelect

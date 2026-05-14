import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  primaryKey,
  unique,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

// ─── Users ───────────────────────────────────────────────────────────────────
// The single env-based admin (id='admin') is upserted on each successful login
// so it always has a row alongside accounts the admin creates from the UI.
// `userId` columns on other tables are plain text (no FK) — keeps deletion of
// a user's data the app's responsibility, matching how the app worked before
// multi-user existed.

export const users = pgTable('users', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  username:     text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  // Usernames stored lowercased; uniqueness is plain (no CITEXT needed).
  unique('users_username_unique').on(t.username),
])

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
  positionX:   integer('position_x').default(0).notNull(),
  positionY:   integer('position_y').default(0).notNull(),
  width:       integer('width').default(240).notNull(),
  height:      integer('height').default(220).notNull(),
  zIndex:      integer('z_index').default(0).notNull(),
  isCollapsed: boolean('is_collapsed').default(false).notNull(),
  color:       text('color').default('yellow').notNull(),
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
export type User        = typeof users.$inferSelect

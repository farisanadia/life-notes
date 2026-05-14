# Life Notes

A self-hosted personal notes app at [notes.farisanadia.com](https://notes.farisanadia.com). Built to replace scattered notes across devices — with sync, full-text search, folder/tag organisation, and a client-side encrypted vault for secrets.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | Neon (serverless PostgreSQL) |
| ORM | Drizzle ORM |
| Auth | NextAuth.js v5 (Credentials) |
| Session store | Upstash Redis (rate limiting + session revocation) |
| Editor | CodeMirror 6 + `@codemirror/lang-markdown` with a custom live-preview extension |
| Markdown render | `@uiw/react-md-editor` (preview only, on resting cards) |
| Drag & drop | `@dnd-kit` |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel + Cloudflare DNS |

## Features by Phase

### Phase 1 — Foundation & Auth (complete)
- **Multi-user** with credential login (username + bcrypt password)
  - One env-seeded **admin** account (`ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH_B64`); env stays the source of truth for admin credentials
  - Admin creates additional accounts at `/settings/users` (no public registration)
  - Per-user data isolation: every server-side query is scoped by `userId`; no cross-user reads
- JWT sessions with per-token revocation via Redis
- IP-based login rate limiting (10 attempts / 15-minute window, backed by Redis)
- Admin API key endpoint to clear a rate-limited IP: `DELETE /api/rate-limit/:ip`
- Light / dark / system theme toggle (persisted via next-themes)
- Route protection via `proxy.ts`

### Phase 2 — Notes, Folders, Tags (complete)
- **Spatial canvas**, not a list — notes are draggable sticky cards on a free 2D board (`@dnd-kit`). Position, size, color, z-order, and collapsed state all persist per note.
- **Inline live-preview editing** on each card via CodeMirror 6 with a custom `livePreview` extension: markdown is styled as you type (bold, italic, code, headings, bullets, etc.) and syntax markers hide off the active line — Obsidian-style.
- **Opt-in full-screen editor** at `/notes/[id]`, reached via the expand icon on a card. Same CodeMirror live editor but roomier, with a formatting toolbar (bold / italic / strikethrough / inline code / heading / list / task list / quote / code block / table / horizontal rule / image / link).
- **800ms debounced autosave** on title and content; ⌘B / ⌘I shortcuts in either editor.
- **Zoom & pan** — buttons + ⌘/ctrl-scroll to zoom toward the cursor (20–100%); a "Fit" button frames every note in view at once for spotting groupings.
- **Safer destructive actions** — trash sits behind a `MoreMenu` overflow with a two-click confirmation (3-second arm window), so it's never adjacent to commonly-clicked controls.
- **Resting cards** show rendered markdown (`@uiw/react-md-editor` preview), a hover color picker, expand / collapse / more buttons, and a corner resize handle.
- **Tag filter bar** at the top dims non-matching cards on the canvas; click multiple tags to combine.
- **New note** drops a card at the centre of the current viewport in immediate edit mode — no extra click.
- **Click-outside or Escape** exits edit mode.
- Pin, trash, restore, and delete still work; folders + tags still managed in the sidebar with ownership-enforced server actions.

### Phase 3 — Full-Text Search (planned)
- PostgreSQL `tsvector` GENERATED column with GIN index
- `ts_headline` excerpts with highlighted matches
- Search bar with debounced `?q=` routing

### Phase 4 — Encrypted Vault (planned)
- Client-side encryption via Web Crypto API (PBKDF2 + AES-GCM)
- Master password derived key stored in React context only — never persisted
- Server stores opaque ciphertext blobs; plaintext never leaves the browser

### Phase 5 — Semantic Search (planned)
- pgvector extension on Neon
- Note embeddings via OpenAI `text-embedding-3-small`
- Hybrid search: PostgreSQL FTS + vector cosine similarity

## Security

- **Admin** password lives in env (`ADMIN_PASSWORD_HASH_B64`, bcrypt cost 12, base64-encoded to dodge dotenv interpolation); the admin row in `users` is auto-upserted on each successful admin login with an opaque placeholder hash.
- **Other accounts** have their bcrypt hashes (cost 12) stored in `users.password_hash`. Created admin-side at `/settings/users` — no public registration.
- All server actions call `requireAuthStrict()` (JWT + Redis revocation); admin-only actions go through `requireAdmin()` which adds an `userId === 'admin'` check.
- Page renders call `requireAuth()` (JWT only, fast); admin pages use `requireAdminAuth()` and `notFound()` on non-admin so the route's existence isn't leaked.
- Every DB query is scoped with `WHERE user_id = $userId` — no cross-user data leakage.
- Session tokens are blocklisted in Redis on sign-out (TTL = session max age).
- Rate limiting resets on successful login; counts only failed attempts.
- **Caveat**: deleting a user does not yet revoke their existing JWT (max 7d lifetime). All their data queries return empty (scoped by `userId`), so the deleted account sees no data, but the token still decodes. Future hardening: track active sessions per user.

## Local Development

```bash
npm install
npm run dev
```

Required environment variables in `.env.local`:

```
DATABASE_URL=
AUTH_SECRET=
ADMIN_USERNAME=
ADMIN_PASSWORD_HASH_B64=   # base64-encoded bcrypt hash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
ADMIN_API_KEY=             # for the rate-limit clear endpoint
```

Generate the password hash:
```bash
node -e "require('bcryptjs').hash('yourpassword', 12).then(h => console.log(Buffer.from(h).toString('base64')))"
```

## Database

Schema is managed with Drizzle ORM. Push changes to Neon:
```bash
npx drizzle-kit push
```

Tables: `users`, `notes`, `folders`, `tags`, `note_tags`, `vault_entries`

## Testing

```bash
npm test
```

132 tests covering auth guards (including `requireAdmin` / `requireAdminAuth`), rate limiting, login action, all user/note/folder/tag server actions (including `createUserAction`, `deleteUserAction`, `updateNotePosition`, `updateNoteSize`, `updateNoteColor`, `updateNoteZIndex`, `setNoteCollapsed`). Mocks are used for Redis, Neon, and NextAuth — no live connections required.

## CI/CD

GitHub Actions runs `tsc` and `vitest` on every push and pull request targeting `main`. Merging to `main` triggers an automatic production deployment on Vercel.

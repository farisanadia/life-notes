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
| Editor | @uiw/react-md-editor (split-pane Markdown) |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel + Cloudflare DNS |

## Features by Phase

### Phase 1 — Foundation & Auth (complete)
- Single-user credential login (username + bcrypt password)
- JWT sessions with per-token revocation via Redis
- IP-based login rate limiting (10 attempts / 15-minute window, backed by Redis)
- Admin API key endpoint to clear a rate-limited IP: `DELETE /api/rate-limit/:ip`
- Light / dark / system theme toggle (persisted via next-themes)
- Route protection via `proxy.ts`

### Phase 2 — Notes, Folders, Tags (complete)
- Create, edit, trash, restore, and delete notes
- Split-pane Markdown editor with 800ms debounced autosave
- Pin notes to the top of the list
- Folder and tag management (create, rename, delete)
- Assign and remove tags per note with ownership enforcement
- Move notes between folders
- Sidebar showing all folders and tags

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

- Passwords hashed with bcrypt (cost 12), stored base64-encoded in env to avoid dotenv interpolation issues
- All server actions call `requireAuthStrict()` — JWT decode + Redis revocation check
- Page renders call `requireAuth()` — JWT decode only (no network, fast)
- Every DB query is scoped with `WHERE user_id = $userId` — no cross-user data leakage
- Session tokens are blocklisted in Redis on sign-out (TTL = session max age)
- Rate limiting resets on successful login; counts only failed attempts

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

Tables: `notes`, `folders`, `tags`, `note_tags`, `vault_entries`

## Testing

```bash
npm test
```

93 tests covering auth guards, rate limiting, login action, and all note/folder/tag server actions. Mocks are used for Redis, Neon, and NextAuth — no live connections required.

## CI/CD

GitHub Actions runs `tsc` and `vitest` on every push and pull request targeting `main`. Merging to `main` triggers an automatic production deployment on Vercel.

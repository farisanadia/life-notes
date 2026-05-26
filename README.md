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

> **Status: Phase 2 complete.** Phase 1 and Phase 2 are deployed; Phase 3 (full-text search) is next.

### Phase 1 — Foundation & Auth (complete)
- Single-user credential login (username + bcrypt password) — extended into the multi-user model in Phase 2
- JWT sessions with per-token revocation via Redis
- IP-based login rate limiting (10 attempts / 15-minute window, backed by Redis)
- Admin API key endpoint to clear a rate-limited IP: `DELETE /api/rate-limit/:ip`
- Light / dark / system theme toggle (persisted via next-themes)
- Route protection via `proxy.ts`

### Phase 2 — Notes UX & Multi-User (complete)

- **Spatial canvas**, not a list — notes are draggable sticky cards on a free 2D board (`@dnd-kit`). Position, size, color, z-order, and collapsed state all persist per note.
- **Inline live-preview editing** on each card via CodeMirror 6 with a custom `livePreview` extension: markdown is styled as you type (bold, italic, code, headings, bullets, etc.) and syntax markers hide off the active line — Obsidian-style.
- **Opt-in full-screen editor** at `/notes/[id]`, reached via the expand icon on a card. Same CodeMirror live editor but roomier, with a formatting toolbar (bold / italic / strikethrough / inline code / heading / list / task list / quote / code block / table / horizontal rule / image / link).
- **800ms debounced autosave** on title and content; ⌘B / ⌘I shortcuts in either editor.
- **Zoom & pan** — buttons + ⌘/ctrl-scroll to zoom toward the cursor (20–100%); a "Fit" button frames every note in view at once for spotting groupings.
- **Marquee selection** — drag on empty canvas to lasso multiple cards; selected notes drag and trash together.
- **Topic view** — click a tag in the filter bar to enter a focused layout (`lib/topic-view.ts`) that arranges the tag's notes in a compact grid; non-matching cards are pushed out of the bbox by `lib/displace.ts` so the preview stays uncluttered. Esc exits.
- **Tag assignment from the canvas** — `TagSelectModal` (multi-select with type-ahead create) is reachable from each card's `MoreMenu`; backed by `tagNote` / `untagNote` server actions.
- **Safer destructive actions** — trash sits behind a `MoreMenu` overflow with a two-click confirmation (3-second arm window), so it's never adjacent to commonly-clicked controls. Drag a card off-canvas onto the trash zone for one-shot delete.
- **Resting cards** show rendered markdown (`@uiw/react-md-editor` preview), a hover color picker, expand / collapse / more buttons, and a corner resize handle.
- **New note** drops a card at the top of the visible stack in immediate edit mode — no extra click.
- **Click-outside or Escape** exits edit mode.
- Pin, trash, restore, and delete from the canvas.
- **Multi-user accounts**: one env-seeded admin (`ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH_B64`) plus additional accounts created admin-side at `/settings/users`. Per-user data isolation enforced by `userId` scoping on every server query.

**Deferred to later phases:**
- Per-folder pages (`/folders/[id]`) and per-tag pages (`/tags/[id]`) — the sidebar lists them, but routing into a dedicated view is not yet wired.
- Vault UI — sidebar link exists, page is empty (Phase 4 territory).

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

### Authentication & data isolation
- **Admin** password lives in env (`ADMIN_PASSWORD_HASH_B64`, bcrypt cost 12, base64-encoded to dodge dotenv interpolation); the admin row in `users` is auto-upserted on each successful admin login with an opaque placeholder hash.
- **Other accounts** have their bcrypt hashes (cost 12) stored in `users.password_hash`. Created admin-side at `/settings/users` — no public registration.
- All server actions call `requireAuthStrict()` (JWT + Redis revocation); admin-only actions go through `requireAdmin()` which adds an `userId === 'admin'` check.
- Page renders call `requireAuth()` (JWT only, fast); admin pages use `requireAdminAuth()` and `notFound()` on non-admin so the route's existence isn't leaked.
- Every DB query is scoped with `WHERE user_id = $userId` — no cross-user data leakage.
- Session tokens are blocklisted in Redis on sign-out (TTL = session max age).
- Rate limiting resets on successful login; counts only failed attempts.
- **Caveat**: deleting a user does not yet revoke their existing JWT (max 7d lifetime). All their data queries return empty (scoped by `userId`), so the deleted account sees no data, but the token still decodes. Future hardening: track active sessions per user.

### Content Security Policy & headers (proxy.ts)
Per-request nonce CSP applied to every response:
- `script-src 'self' 'nonce-…' 'strict-dynamic'` — only Next.js-emitted scripts run; no inline-script injection from rendered markdown can execute.
- `img-src 'self' data: blob:` — external images blocked at the browser level (see image proxy below).
- `style-src 'self' 'unsafe-inline'` — needed for Tailwind / CodeMirror / dnd-kit inline styles.
- `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
- `'unsafe-eval'` is added only in dev for React's error overlay.

Companion headers: `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a lockdown `Permissions-Policy`, and `Strict-Transport-Security: max-age=31536000; includeSubDomains` in production.

Because nonces must change per request, the root layout opts into dynamic rendering (`export const dynamic = 'force-dynamic'`). Without this, Vercel statically prerenders pages and the cached HTML's `<script>` tags carry no nonce — every chunk gets blocked and React never hydrates.

### Markdown XSS hardening
`@uiw/react-markdown-preview` parses raw HTML by default. The render pipeline now runs `rehype-sanitize` with the default GitHub schema, which strips `<script>`, `<iframe>`, `<object>`, event handlers, and `javascript:` URLs before any DOM commit.

### Image proxy & SSRF protection (`/api/img-proxy`)
External images can't reach the browser directly (CSP). Instead, a rehype plugin rewrites every external `<img src>` to flow through `/api/img-proxy?url=…`, which fetches the bytes server-side and re-serves them under our origin. The proxy:

- Requires an authenticated session.
- Allows only `http://` / `https://` and ports 80 / 443.
- Resolves DNS itself and rejects every private/loopback/link-local/CGNAT/cloud-metadata/multicast/reserved IPv4 range, plus IPv6 unique-local / link-local / multicast / documentation / NAT64 ranges. **Both notation forms** of IPv4-mapped IPv6 are caught (dotted `::ffff:127.0.0.1` and hex `::ffff:7f00:1` resolve to the same loopback address).
- Plugs the custom DNS resolver into undici's connection pool, closing the DNS-rebinding TOCTOU window — the same resolved IPs used for the check are used for the connect.
- Caps response size (10 MB), wall-clock time (8 s), and requires `Content-Type: image/*`.
- Strips client identifying headers from the outbound fetch (no cookies, referer, or authorization).

Caveat: redirect targets are re-checked for IP-privacy but not for port — a malicious upstream could 3xx to a non-standard port on a public host. Private networks remain unreachable; the residual risk is the proxy being used as a public-internet timing oracle. Tracked for hardening.

### Test coverage
`__tests__/ssrf.test.ts`, `__tests__/proxy-img.test.ts`, `__tests__/img-proxy-route.test.ts` — 65+ cases covering IP classifier corner cases (including the v4-mapped-IPv6 hex-notation bypass), URL/scheme/port validation, auth gating, content-type and size guards, and outbound request shape.

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

212+ tests covering auth guards (including `requireAdmin` / `requireAdminAuth`), rate limiting, login action, all user/note/folder/tag server actions, the SSRF IP classifier (`lib/ssrf.ts`), the markdown image rewriter (`lib/proxy-img.ts`), the `/api/img-proxy` route handler (auth, URL/port validation, content-type and size guards, outbound request shape), and the pure canvas helpers — marquee hit-testing (`lib/marquee.ts`), topic-view layout (`lib/topic-view.ts`), and bbox displacement (`lib/displace.ts`). Mocks are used for Redis, Neon, NextAuth, and undici — no live connections required.

## CI/CD

GitHub Actions runs `tsc` and `vitest` on every push and pull request targeting `main`. Merging to `main` triggers an automatic production deployment on Vercel.

Neon is split into two branches: `main` (production) and `dev` (everything else). In Vercel the `DATABASE_URL` env var is scoped — production deploys connect to the prod branch, Preview and Development deploys to the dev branch — so feature branches can't mutate prod data.

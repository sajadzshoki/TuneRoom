# TuneRoom

A shared music room for a small group of people. Create a room, share the link,
let everyone drop in their own tracks, and listen — each person controls their
own playback.

No accounts, no feeds, no recommendations, no synchronized watch-party. Just a
room, a library of music, and a player that keeps playing while you navigate.

---

## Quick start

Requirements: **Node.js 20.19+** and npm. No database server needed for local
development — TuneRoom falls back to an embedded PostgreSQL (PGlite) that writes
to `.data/pg`.

```bash
npm install
npm run dev
# → http://localhost:3000
```

The first thing you will be asked for is a display name and an avatar. That is
the whole identity model: a signed cookie remembers you on this device, so a
refresh never creates a second person.

### The flow

1. **Create a room** — pick a name, get a 6-character code and a slug URL.
2. **Share** — copy the link, the code, or scan the QR code.
3. **Join** — visitors enter a name, pick an avatar, and become members.
4. **Add music** — upload audio files (with real per-file progress) or paste a
   direct link to an audio file; both are stored on the server.
5. **Play** — search, sort, favorite, queue, shuffle, repeat, download.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on `0.0.0.0:3000` with hot reload |
| `npm run build` | Production build into `.output` (runs `postbuild` checks after) |
| `npm start` | Run the production build (`node .output/server/index.mjs`) |
| `npm run preview` | Same as `start`, named for clarity after a build |
| `npm run typecheck` | `vue-tsc` over the whole project |
| `npm run lint` | ESLint (Nuxt flat config) |
| `npm run lint:fix` | ESLint with autofix |
| `npm run verify` | Typecheck + lint + build, in that order |
| `npm run db:generate` | Generate SQL migrations from `server/db/schema.ts` |
| `npm run db:studio` | Drizzle Studio against the configured database |

### End-to-end smoke test

`scripts/smoke.mjs` exercises the real HTTP API — identity, rooms, membership,
uploads, metadata edits, favorites, queues, playback counting, permissions,
QR codes, SSRF refusals, validation abuse and cascade deletes — and asserts 76
conditions.

```bash
npm run dev                                   # or: npm run build && npm start
SMOKE_BASE_URL=http://127.0.0.1:3000 \
SMOKE_SAMPLE=/tmp/tuneroom-sample.wav \
  node scripts/smoke.mjs
```

`SMOKE_SAMPLE` must point at a real audio file (any MP3/WAV works). The script
creates its own rooms and cleans them up afterwards.

## Configuration

Every variable is optional in development. Copy `.env.example` to `.env` to
override.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NUXT_SESSION_SECRET` | dev placeholder | HMAC secret that signs the guest identity cookie. **Required in production.** Generate one with `openssl rand -hex 32`. |
| `DATABASE_URL` | *(empty)* | `postgres://…` connection string. When set, TuneRoom uses node-postgres. When empty, it uses embedded PGlite. |
| `PGDATA_DIR` | `.data/pg` | Data directory for the embedded database. |
| `STORAGE_DRIVER` | `local` | Object storage driver. Only `local` ships with the MVP. |
| `STORAGE_DIR` | `.data/storage` | Where audio and cover files are written. |
| `NUXT_PUBLIC_APP_URL` | *(derived)* | Absolute origin used for share links and QR codes. Leave empty to derive it from the request. |
| `MAX_UPLOAD_MB` | `60` | Per-file upload cap (shared with the upload UI). |
| `MAX_URL_FETCH_MB` | `60` | Cap for files fetched from a pasted link. |
| `RATE_LIMIT_ENABLED` | `true` | In-memory rate limiter. |

### Production

```bash
cp .env.example .env          # set NUXT_SESSION_SECRET, DATABASE_URL, STORAGE_DIR
npm run build
npm start
```

Notes for a real deployment:

- Point `DATABASE_URL` at a managed PostgreSQL and run the migrations in
  `drizzle/` (or `npm run db:generate` + your migration runner).
- `STORAGE_DIR` must be a persistent, backed-up volume. Files never live in the
  database; only their storage keys do.
- The rate limiter is in-memory per process, so it is per-instance by design.
- Run behind TLS; the identity cookie is set `HttpOnly` + `SameSite=Lax`.

## What is in the box

**Rooms** — 6-character code, unique human slug, rename/description by the
owner, delete by the owner (songs, members, favorites and queued items cascade),
QR code endpoint, share sheet with native share support.

**People** — name + avatar only, one identity per browser (signed cookie),
presence heartbeat with an "online" cutoff, member list capped and sorted
(you → online → joined), per-guest favorites and per-guest queue.

**Library** — file upload with per-file progress and cancellation, add-by-link
with SSRF protection, tag reading (title/artist/album/duration/cover), a review
step when tags are missing, cover upload, search across title/artist/album/
uploader (locale-aware, so Persian text sorts and matches correctly), sorting,
grid/list views, and honest empty states.

**Player** — one global `<audio>` element that survives navigation, seek/volume/
mute, shuffle, repeat off/all/one, up-next queue with reorder, full-screen
player, space-bar toggle, keyboard-accessible sliders, auto-skip after repeated
playback failures, and a play counter registered once per listen.

**Interface** — dark-only design system (deep charcoal + a single amber accent),
responsive from 320 px up, safe-area aware, logical CSS properties throughout so
right-to-left text and Persian titles render correctly.

## Project layout

```
app/                Nuxt 4 app directory
  assets/css/       design system: tokens, surfaces, slider, animations
  components/       room, player, upload and share UI
  composables/      usePlayer, useRoom, useRoomData, useIdentity, useApi
  pages/            /, /create, /join, /room/[code], catch-all 404
  utils/            formatting, artwork fallbacks, upload transport
server/
  api/              25 JSON endpoints under /api
  db/schema.ts      Drizzle schema (6 tables)
  utils/            auth, validation, storage, ingest, streaming, rate limits
shared/             types + constants used by both client and server
drizzle/            SQL migrations
scripts/            smoke test, postbuild checks, test-audio generator
```

`PROJECT.md` documents the architecture, the data model, the API contract and
the deliberate limitations.

## Tech

Nuxt 4 · TypeScript (strict) · Tailwind CSS v4 · Nuxt UI v4 · Drizzle ORM ·
PostgreSQL (node-postgres) or embedded PGlite · `music-metadata` · `qrcode` ·
Zod · ESLint.

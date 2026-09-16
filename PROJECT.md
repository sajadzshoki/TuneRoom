# TuneRoom — engineering notes

This document describes how the project is built and why. `README.md` covers
setup and usage; this file covers architecture, contracts and limits.

---

## 1. Shape of the system

One Nuxt 4 application serves both the UI and the API. There is no separate
backend, no queue, no websocket server and no background worker.

```
Browser ──▶ Nitro server routes (/api/**) ──▶ Drizzle ──▶ PostgreSQL | PGlite
                    │
                    └──▶ object storage driver ──▶ local filesystem
```

* **Rendering.** Pages are server-rendered. A room's library is fetched during
  SSR through `useRequestFetch()` so the first paint already contains the songs;
  the same code path runs on the client for refreshes.
* **Realtime.** Deliberately absent. Presence is a 20-second heartbeat and the
  library is re-fetched every 30 seconds. Both stop when the tab is hidden.
* **Playback state.** Entirely client-side, in one module-scoped composable, so
  navigation never remounts the `<audio>` element.

## 2. Data model

`server/db/schema.ts` — six tables. Every foreign key cascades, so deleting a
room or a guest can never leave orphans.

| Table | Purpose | Key points |
| --- | --- | --- |
| `guests` | A person on one device | `id`, `name`, `avatar` (one of 12 generated presets), `last_seen_at`. Indexed on `last_seen_at`. |
| `rooms` | A shared room | Unique `code` (6 chars, shareable) and unique `slug` (URL). `owner_id → guests` cascade. |
| `room_members` | Membership **and** presence | Composite PK `(room_id, guest_id)`; `last_seen_at` is refreshed by the heartbeat. Both FKs cascade. |
| `songs` | A track in a room library | Metadata (`title`, `artist`, `album`, `duration`), storage keys (`audio_key`, `cover_key`), `audio_mime`, `audio_size`, `source` (`upload`\|`url`), `source_url`, `plays`. Both FKs cascade. Indexed on `(room_id, created_at)` and `(room_id, title)`. |
| `favorites` | Per-guest favorite | Composite PK `(song_id, guest_id)`. |
| `queues` | Per-guest, per-room up-next | Composite PK `(room_id, guest_id)`, ordered `song_ids` in JSONB. |

Audio bytes are **never** in the database — only storage keys are. Migrations
live in `drizzle/` (`0000_init.sql`).

## 3. API contract

25 endpoints under `/api`. All request bodies are validated with Zod
(`server/utils/validate.ts`); all responses are typed DTOs from `shared/types.ts`.

```
POST   /api/guests                                  create identity (name + avatar)
GET    /api/guests/me                               current identity
PATCH  /api/guests/me                               rename / change avatar

POST   /api/rooms                                   create room
GET    /api/rooms/:code                             public room card (no membership needed)
PATCH  /api/rooms/:code                             owner: rename / re-describe
DELETE /api/rooms/:code                             owner: delete (cascades)
GET    /api/rooms/:code/state                       member: room + songs + members + favorites
GET    /api/rooms/:code/members                     member list (capped at 60)
POST   /api/rooms/:code/members                     join
POST   /api/rooms/:code/presence                    heartbeat → refreshed member list
GET    /api/rooms/:code/qr                          QR code as SVG

GET    /api/rooms/:code/songs                       library (search/sort aware)
POST   /api/rooms/:code/songs                       add from a URL
POST   /api/rooms/:code/songs/upload                multipart upload (real progress)
GET    /api/rooms/:code/songs/:id                   one song
PATCH  /api/rooms/:code/songs/:id                   uploader or owner: fix metadata
DELETE /api/rooms/:code/songs/:id                   uploader or owner: delete + storage cleanup
POST   /api/rooms/:code/songs/:id/favorite          toggle favorite
POST   /api/rooms/:code/songs/:id/play              register a play (deduped)
GET    /api/rooms/:code/songs/:id/audio             stream (HTTP range requests)
GET    /api/rooms/:code/songs/:id/cover             cover art (404 when a song has none —
                                                     the UI then draws a generated placeholder)
POST   /api/rooms/:code/songs/:id/cover             replace cover art

GET    /api/rooms/:code/queue                       my queue
PUT    /api/rooms/:code/queue                       replace my queue (debounced 600 ms)
```

`:code` accepts either the 6-character code or the slug.

### Errors

One envelope for every failure, produced by `server/errorHandler.ts`:

```json
{ "code": "ROOM_NOT_FOUND", "message": "We could not find that room.", "details": { } }
```

* The HTTP status carries the class of failure (`400` validation, `401` no
  identity, `403` not a member / not allowed, `404` missing, `410` storage gone,
  `413` too large, `415` unsupported type, `422` semantic, `429` rate limited,
  `500` unexpected).
* `details.fields` maps a field name to a human sentence for form errors.
* `429` responses include a `Retry-After` header.
* Unexpected errors are logged server-side and reported generically — stack
  traces, SQL and file paths never reach a client.
* Responses set `x-content-type-options: nosniff` and `cache-control: no-store`.
* The handler only answers JSON for `/api/**` (or JSON-accepting) requests.
  Unknown *page* addresses are rendered by `app/pages/[...slug].vue` with a real
  `404` status, and unrenderable pages fall back to `app/error.vue`.

### Identity and permissions

* Identity is a signed token (`tr_identity`, HMAC-SHA256 over the guest id) in
  an `HttpOnly`, `SameSite=Lax` cookie. No passwords, no email, no sessions
  table. An invalid or forged token is treated as "no identity".
* Every membership check happens **server-side** in `useRoomContext` /
  `useSongContext`. The client never sends an owner flag, and DTOs are computed
  per viewer (`isOwner`, `isYou`, `favorited`).
* Room rename/delete: owner only. Song edit/delete: uploader or room owner
  (`canManageSong`). Everything else: any member.

### Rate limits

In-memory sliding window, per identity (falling back to IP), keyed per action:

| Action | Limit |
| --- | --- |
| `guest:create` | 20 / minute |
| `guest:update`, `room:join`, `room:update` | 30 / minute |
| `song:update`, `song:delete` | 60 / minute |
| `song:favorite`, `song:play` | 120 / minute |
| `song:upload` | 40 / hour |
| `song:url`, `song:cover` | 20–30 / hour |
| `room:delete` | 5 / hour |

`RATE_LIMIT_ENABLED=false` turns the limiter off.

## 4. Uploads, ingestion and storage

1. **Accept.** `mp3, m4a, aac, wav, ogg, oga, opus, flac, weba` — by extension
   and by sniffed MIME. Size cap `MAX_UPLOAD_MB` (default 60 MB), enforced both
   in the browser (before a byte is sent) and on the server.
2. **Ingest.** `music-metadata` reads tags, duration and embedded artwork.
   Missing tags do not fail the upload: the song is stored with a sensible
   fallback and the response carries `needsMetadata: true`, which the UI turns
   into a "Fix details" review step.
3. **Store.** The driver interface (`useObjectStorage`) exposes `write`,
   `readRange`, `stat`, `remove`. Keys are generated, never user-supplied:
   `rooms/<roomId>/audio/<songId>.<ext>` and `rooms/<roomId>/covers/<songId>.<ext>`.
   `assertSafeStorageKey()` rejects traversal, absolute paths and null bytes.
4. **Add by URL.** The server fetches the link once and stores the bytes, so
   playback never depends on a third-party host. Private/loopback/link-local
   ranges, cloud metadata addresses and non-HTTP schemes are refused before any
   request is made (`server/utils/net.ts`), redirects are re-validated, and the
   response is size-capped while streaming.
5. **Delete.** Removing a song (or a room) removes the row *and* the stored
   files; a missing file at delete time is not an error.
6. **Stream.** `GET …/audio` honours `Range` requests (206 + `Content-Range`),
   advertises `Accept-Ranges`, and adds `Content-Disposition: attachment` with
   both ASCII and RFC 5987 filenames when `?download=1` is present.

To swap in S3-compatible storage, implement the four driver methods behind a new
`STORAGE_DRIVER` value — nothing else in the codebase touches the filesystem.

## 5. Playback engine

`app/composables/usePlayer.ts` holds module-scoped singletons, so there is
exactly one `<audio>` element (`AudioEngine.vue`, mounted once in `app.vue`)
and one source of truth regardless of how many components read it.

* **Position.** A `requestAnimationFrame` ticker owns the position while
  playing; the `timeupdate` event only corrects it while paused. This avoids
  double reactive writes and keeps the seek bar smooth without polling audio.
* **Next track.** The queue wins; otherwise the current *playback context*
  advances (the visible, searched/sorted list a card was clicked in). Shuffle
  never repeats the same index; repeat is `off | all | one`.
* **Resilience.** A failing track is reported in the dock and skipped; after
  three consecutive failures playback stops with a message instead of looping.
  A song deleted by someone else is dropped from the queue and context.
* **Persistence.** Volume, mute, shuffle, repeat and the per-room queue survive
  a refresh (queue in the database, preferences in `localStorage`). Queue writes
  are debounced 600 ms and fire-and-forget — a dropped PUT never interrupts
  playback.
* **Play counting.** Registered once per track load; the server ignores repeats
  inside a 60-second window.
* **Keyboard.** Space toggles playback unless focus is in an input, button, link
  or slider. Sliders are native `<input type="range">` elements with a visual
  track, so arrow keys, Home/End, screen-reader announcements and touch dragging
  work without custom code; in right-to-left text the horizontal arrows flip to
  match the direction of the track.

## 6. Room session and presence

`useRoom` owns the session (room, songs, members, search, sort, view,
favorites-only, loading/error/missing/needsJoin). `useRoomData` loads it:

* state is applied **inside** the `useAsyncData` handler — during SSR Vue only
  runs a watcher's `immediate` callback, so a watcher would leave the server
  rendering a skeleton for data it had already fetched;
* presence heartbeat every 20 s, library poll every 30 s, both paused when the
  document is hidden;
* members are considered online if their `last_seen_at` is within 60 s; the list
  is capped at 60 and sorted you → online → joined;
* mutations update local state immediately (optimistic favorites, song counts)
  and reconcile with the server response; a failed favorite flips back.

The grid/list choice lives in a **cookie** (`tuneroom:view`), not localStorage,
so the server renders the layout the visitor last used and there is no
post-hydration flash. First visit only, phones default to the compact list.

## 7. Frontend structure

```
app/
  app.vue               shell: dark head config, dock padding, audio engine
  error.vue             rendered when a page cannot be rendered at all
  pages/
    index.vue           landing
    create.vue          create a room
    join.vue            join by code (?code=… prefill)
    room/[code].vue     the room: header, library, toolbar, overlays
    [...slug].vue       branded 404 (real 404 status; /api/* stays JSON)
  components/           AppHeader, RoomHeader, SongCard, SongGrid, SongList,
                        PlayerDock, FullScreenPlayer, TransportControls,
                        SeekSlider, QueueDrawer, CoverArt, PersonAvatar,
                        AvatarStack, EqualizerBars, LogoMark, EmptyMusicState,
                        ErrorState, AddMusicModal, EditSongModal,
                        ShareRoomModal, RoomSettingsModal, PeoplePopover,
                        JoinRoomOverlay, CreateRoomForm
  composables/          usePlayer, useRoom, useRoomData, useIdentity, useApi
  utils/                format (duration, bytes, plural), artwork fallbacks,
                        upload transport (XHR for progress + abort)
```

## 8. Design system

Dark-only. One accent, no gradients, no glassmorphism, no purple.

| Token | Value | Use |
| --- | --- | --- |
| `--color-base` | `#09090b` | page background (also `theme-color`) |
| `--color-surface` | `#0f0f13` | dock, drawers, dialogs |
| `--color-raised` | `#17171d` | cards, hover fills |
| `--color-hairline` | `#23232b` | borders |
| `--color-chalk` / `mist` / `ash` | `#ededf0` / `#9c9ca6` / `#6b6b76` | text hierarchy |
| `--color-brand-*` | amber, `brand-400 = #f6b445` | primary actions, playing state |
| `--color-ink-*` | neutral ramp, `ink-950 = #0b0b0e` | Nuxt UI neutral palette |

Custom palettes are declared as plain Tailwind v4 tokens (`--color-brand-*`,
`--color-ink-*` in `@theme static`) and mapped through
`app/app.config.ts` → `ui.colors.{primary: 'brand', neutral: 'ink'}`. That mapping
is what makes `color="primary"` components resolve; declaring `--ui-color-*`
directly (the v3 style) compiles but leaves the semantic chain empty.

**Stacking scale** (documented in `main.css`): `30` sticky headers, `40` the
fixed player dock, `50` the full-screen player. Dialogs, popovers and toasts are
portalled to `<body>` after `#__nuxt`, which Nuxt renders with `class="isolate"`,
so they always paint above the shell without arbitrary z-index values.

**Layout discipline.** The shell reserves `pb-dock` while a track is playing so
the dock never covers content; the dock and full-screen player pad themselves
with `env(safe-area-inset-*)` and the viewport uses `viewport-fit=cover`; tap
targets are 32–44 px; every truncating label carries a `title`.

**International text.** All direction-sensitive utilities are logical
(`ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`, `text-start`/`text-end`,
`rounded-s/e`) and free-text nodes use `dir="auto"`, so Persian titles, artists
and room names align correctly inside an otherwise LTR interface. Icons are
never mirrored.

## 9. Security posture

Proportionate for a no-auth MVP, but the obvious holes are closed:

* Storage keys are generated and validated; room refs are parameterised; no
  user string reaches the filesystem or the SQL text.
* URL ingestion resolves and re-validates every hop against private ranges
  (SSRF), caps the download size and refuses non-HTTP schemes.
* Text fields are length-limited and stripped of control characters; filenames
  are sanitised for `Content-Disposition`.
* The identity cookie is signed, `HttpOnly`, `SameSite=Lax`; secrets live only in
  server runtime config and are never serialised to the client.
* Audio and library endpoints require membership — the only public reads are a
  room's name/description/counts and its QR code.
* Uploaded audio is streamed with `nosniff`; cover images are restricted to a
  whitelisted MIME type and extension (`jpg, jpeg, png, webp, gif`).

## 10. Verification

| Check | Command | Status |
| --- | --- | --- |
| Types (strict, `vue-tsc`) | `npm run typecheck` | clean |
| Lint (ESLint + Nuxt flat config) | `npm run lint` | clean |
| Production build | `npm run build` | succeeds |
| API end-to-end (76 assertions) | `node scripts/smoke.mjs` | passing on dev and on the production build |

The smoke test covers: identity creation and reuse, room create/join/rename/
delete, upload with metadata override, add-by-URL including SSRF refusals,
favorite toggle, queue replace and pruning of deleted songs, play counting and
dedupe, member vs. owner permission checks, path traversal in the room ref,
malformed payloads, over-long inputs, QR rendering and cascade deletes.

## 11. Known limitations (deliberate)

* **No accounts.** Identity is per-browser. Clearing cookies means a new person;
  there is no way to reclaim a room. This is the product's premise, not a gap.
* **No realtime.** Presence and library updates are polled (20 s / 30 s). Two
  people editing the same song's metadata at once resolve last-write-wins.
* **No transcoding.** Files are stored and streamed as uploaded. A codec the
  browser cannot play reports a playback error and skips; it is not converted.
* **Single-node storage and rate limiting.** The local driver assumes one
  writable volume, and the limiter is per process. Both are interfaces, not
  designs — swap the driver and move the limiter to Redis for multi-instance
  deployments.
* **Room size.** The member list is capped at 60 and libraries are served whole
  (no pagination), which matches the "a group of people" premise.
* **No moderation tooling.** The owner can remove any song or delete the room;
  there is no admin panel, no reporting and no audit log.

Out of scope on purpose: chat, comments, reactions, follows, notifications,
payments, authentication, recommendations, playlists beyond the up-next queue,
synchronized playback, and any admin surface.

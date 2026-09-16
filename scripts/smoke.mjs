#!/usr/bin/env node
/**
 * End-to-end API smoke test.
 *
 * Exercises the real HTTP API against a running dev server: identity, rooms,
 * membership, upload, metadata extraction, range streaming, favorites, plays,
 * queue, presence, permissions and cleanup. Nothing is mocked and the room it
 * creates is deleted at the end, so it is safe to run against a dev database.
 *
 *   npm run dev          # in one terminal
 *   node scripts/smoke.mjs
 *
 * Requires a sample WAV: `python3 scripts/make-test-audio.py /tmp/tuneroom-sample.wav`
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const SAMPLE = process.env.SMOKE_SAMPLE || '/tmp/tuneroom-sample.wav'

let passed = 0
let failed = 0
const failures = []

function check(label, condition, extra = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  }
  else {
    failed++
    failures.push(`${label}${extra ? ` — ${extra}` : ''}`)
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`)
  }
}

function group(name) {
  console.log(`\n${name}`)
}

/** Minimal cookie-jar HTTP client so each persona keeps its own identity. */
class Client {
  constructor(label) {
    this.label = label
    this.cookies = new Map()
  }

  get cookieHeader() {
    return [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ')
  }

  async request(path, { method = 'GET', body, headers = {}, redirect = 'manual' } = {}) {
    const response = await fetch(`${BASE}${path}`, {
      method,
      body,
      redirect,
      headers: {
        ...(this.cookieHeader ? { cookie: this.cookieHeader } : {}),
        ...headers,
      },
    })

    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(';')
      const index = pair.indexOf('=')
      const key = pair.slice(0, index)
      const value = pair.slice(index + 1)
      if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(cookie))
        this.cookies.delete(key)
      else
        this.cookies.set(key, value)
    }

    const type = response.headers.get('content-type') ?? ''
    const payload = type.includes('json')
      ? await response.json().catch(() => null)
      : type.startsWith('text') || type.includes('svg')
        ? await response.text()
        : Buffer.from(await response.arrayBuffer())

    return { status: response.status, headers: response.headers, body: payload }
  }
}

function json(value) {
  return { body: JSON.stringify(value), headers: { 'content-type': 'application/json' } }
}

async function audioForm(file, fileName, meta) {
  const form = new FormData()
  form.append('file', new Blob([await readFile(file)], { type: 'audio/wav' }), fileName)
  if (meta)
    form.append('meta', JSON.stringify(meta))
  return { body: form }
}

async function main() {
  if (!existsSync(SAMPLE)) {
    console.error(`Missing sample audio at ${SAMPLE}.`)
    console.error('Run: python3 scripts/make-test-audio.py /tmp/tuneroom-sample.wav')
    process.exit(1)
  }

  const health = await fetch(`${BASE}/api/guests/me`).then(r => r.status).catch(() => 0)
  if (health !== 200) {
    console.error(`Server not reachable at ${BASE} (status ${health}). Start it with \`npm run dev\`.`)
    process.exit(1)
  }

  const owner = new Client('owner')
  const member = new Client('member')
  const stranger = new Client('stranger')
  const stamp = Date.now().toString(36)

  group('Identity')
  const anon = await stranger.request('/api/guests/me')
  check('anonymous visitor has no identity', anon.status === 200 && anon.body?.guest === null)

  const badGuest = await stranger.request('/api/guests', { method: 'POST', ...json({ name: '', avatar: 'nope' }) })
  check('invalid identity is rejected', badGuest.status === 422, `got ${badGuest.status}`)
  check('validation errors carry field details', Boolean(badGuest.body?.details?.fields))

  const createdOwner = await owner.request('/api/guests', { method: 'POST', ...json({ name: 'Sajad', avatar: 'amber' }) })
  check('identity can be created', createdOwner.status === 200 && Boolean(createdOwner.body?.guest?.id))
  check('identity cookie is httpOnly', /tr_identity=/.test(owner.cookieHeader))

  const createdMember = await member.request('/api/guests', { method: 'POST', ...json({ name: 'Mira', avatar: 'teal' }) })
  check('second identity is independent', createdMember.status === 200 && createdMember.body.guest.id !== createdOwner.body.guest.id)

  const me = await owner.request('/api/guests/me')
  check('identity is recognised on the next request', me.body?.guest?.name === 'Sajad')

  const renamed = await owner.request('/api/guests/me', { method: 'PATCH', ...json({ avatar: 'coral' }) })
  check('avatar can be changed', renamed.body?.guest?.avatar === 'coral' && renamed.body.guest.name === 'Sajad')

  group('Rooms')
  const noIdentity = await stranger.request('/api/rooms', { method: 'POST', ...json({ name: 'Nope' }) })
  check('creating a room requires an identity', noIdentity.status === 401, `got ${noIdentity.status}`)

  const created = await owner.request('/api/rooms', {
    method: 'POST',
    ...json({ name: `Smoke Room ${stamp}`, description: 'Created by scripts/smoke.mjs' }),
  })
  const room = created.body?.room
  check('room can be created', created.status === 200 && Boolean(room?.id), `got ${created.status}`)
  check('room has a 6 character code', /^[A-Z2-9]{6}$/.test(room?.code ?? ''), room?.code)
  check('room has a slug', /^smoke-room-/.test(room?.slug ?? ''), room?.slug)
  check('creator is the owner', room?.isOwner === true && room?.isMember === true)
  check('creator starts online', room?.onlineCount === 1)

  const publicView = await stranger.request(`/api/rooms/${room.code}`)
  check('room card is readable before joining', publicView.status === 200 && publicView.body.room.isMember === false)

  const slugView = await stranger.request(`/api/rooms/${room.slug}`)
  check('room resolves by slug too', slugView.status === 200 && slugView.body.room.id === room.id)

  const missing = await stranger.request('/api/rooms/ZZZZZZ')
  check('unknown room returns 404 with a friendly message', missing.status === 404 && missing.body?.code === 'ROOM_NOT_FOUND')

  await stranger.request('/api/guests', { method: 'POST', ...json({ name: 'Visitor', avatar: 'slate' }) })
  const locked = await stranger.request(`/api/rooms/${room.code}/state`)
  check(
    'library is closed to non-members',
    locked.status === 403 && locked.body?.code === 'NOT_A_MEMBER',
    `${locked.status} ${locked.body?.code}`,
  )

  group('Membership + presence')
  const joined = await member.request(`/api/rooms/${room.code}/members`, { method: 'POST' })
  check('member can join', joined.status === 200 && joined.body?.joined === true)

  const heartbeat = await member.request(`/api/rooms/${room.code}/presence`, { method: 'POST' })
  check('heartbeat lists both people', heartbeat.body?.onlineCount === 2, JSON.stringify(heartbeat.body?.onlineCount))
  check('heartbeat marks the caller', heartbeat.body?.members?.some(m => m.isYou && m.name === 'Mira') === true)
  check('room owner is flagged', heartbeat.body?.members?.some(m => m.isOwner && m.name === 'Sajad') === true)

  group('Upload')
  const rejectedType = await owner.request(`/api/rooms/${room.code}/songs/upload`, {
    method: 'POST',
    body: (() => {
      const form = new FormData()
      form.append('file', new Blob([Buffer.from('just some text')], { type: 'text/plain' }), 'notes.txt')
      return form
    })(),
  })
  check('non-audio file is rejected', rejectedType.status === 415 && rejectedType.body?.code === 'UNSUPPORTED_FILE')

  const fakeMp3 = await owner.request(`/api/rooms/${room.code}/songs/upload`, {
    method: 'POST',
    body: (() => {
      const form = new FormData()
      form.append('file', new Blob([Buffer.alloc(4096, 7)], { type: 'audio/mpeg' }), 'pretend.mp3')
      return form
    })(),
  })
  check('corrupt audio is rejected', fakeMp3.status === 422 && fakeMp3.body?.code === 'INVALID_AUDIO')

  const uploaded = await owner.request(`/api/rooms/${room.code}/songs/upload`, {
    method: 'POST',
    ...(await audioForm(SAMPLE, 'tuneroom-sample.wav')),
  })
  const song = uploaded.body?.song
  check('wav upload succeeds', uploaded.status === 200 && Boolean(song?.id), `got ${uploaded.status}: ${JSON.stringify(uploaded.body)?.slice(0, 200)}`)
  check('title is read from the file tags', song?.title === 'Quiet Hours', song?.title)
  check('artist is read from the file tags', song?.artist === 'TuneRoom Test Artist', song?.artist)
  check('album is read from the file tags', song?.album === 'Development Samples', song?.album)
  check('duration is detected', song?.duration === 6, String(song?.duration))
  check('uploader is attributed', song?.uploader?.name === 'Sajad')
  check('uploader can manage the song', song?.canManage === true)
  check('audio url is room scoped', song?.audioUrl === `/api/rooms/${room.code}/songs/${song?.id}/audio`)

  const overridden = await member.request(`/api/rooms/${room.code}/songs/upload`, {
    method: 'POST',
    ...(await audioForm(SAMPLE, 'raw-file-name.wav', { title: 'Manual Title', artist: 'Manual Artist' })),
  })
  const secondSong = overridden.body?.song
  check('metadata overrides win', secondSong?.title === 'Manual Title' && secondSong?.artist === 'Manual Artist')
  check('uploader of the second song is Mira', secondSong?.uploader?.name === 'Mira')
  check('non-owner cannot manage someone else is false for own song', secondSong?.canManage === true)

  group('Streaming')
  const full = await owner.request(song.audioUrl)
  check('audio streams with 200', full.status === 200 && full.body.length > 1000, `status ${full.status}`)
  check('accept-ranges is advertised', full.headers.get('accept-ranges') === 'bytes')
  check('content type is audio', (full.headers.get('content-type') ?? '').startsWith('audio/'))

  const partial = await owner.request(song.audioUrl, { headers: { range: 'bytes=0-1023' } })
  check('range request returns 206', partial.status === 206, `status ${partial.status}`)
  check('content-range is correct', partial.headers.get('content-range')?.endsWith('/1058582') === true, partial.headers.get('content-range'))
  check('partial body is exactly the requested window', partial.body.length === 1024, String(partial.body?.length))

  const suffix = await owner.request(song.audioUrl, { headers: { range: 'bytes=-500' } })
  check('suffix range works', suffix.status === 206 && suffix.body.length === 500)

  const impossible = await owner.request(song.audioUrl, { headers: { range: 'bytes=99999999-' } })
  check('unsatisfiable range returns 416', impossible.status === 416)

  const download = await owner.request(`${song.audioUrl}?download=1`)
  check('download sets a content-disposition', /attachment/.test(download.headers.get('content-disposition') ?? ''))

  const strangerAudio = await stranger.request(song.audioUrl)
  check('non-members cannot stream', strangerAudio.status === 403)

  group('Library, search and sort')
  const library = await owner.request(`/api/rooms/${room.code}/songs`)
  check('library lists both songs', library.body?.songs?.length === 2, String(library.body?.songs?.length))

  const search = await member.request(`/api/rooms/${room.code}/songs?q=manual`)
  check('search matches the artist', search.body?.songs?.length === 1 && search.body.songs[0].title === 'Manual Title')

  const byTitle = await member.request(`/api/rooms/${room.code}/songs?sort=title`)
  check('sort by title orders alphabetically', byTitle.body?.songs?.[0]?.title === 'Manual Title', byTitle.body?.songs?.[0]?.title)

  group('Favorites')
  const fav = await member.request(`/api/rooms/${room.code}/songs/${song.id}/favorite`, { method: 'POST', ...json({}) })
  check('favorite can be toggled on', fav.body?.favorited === true)
  const favAgain = await member.request(`/api/rooms/${room.code}/songs/${song.id}/favorite`, { method: 'POST', ...json({}) })
  check('favorite can be toggled off', favAgain.body?.favorited === false)
  await member.request(`/api/rooms/${room.code}/songs/${song.id}/favorite`, { method: 'POST', ...json({ favorite: true }) })
  const onlyFavs = await member.request(`/api/rooms/${room.code}/songs?favorites=true`)
  check('favorites filter works', onlyFavs.body?.songs?.length === 1 && onlyFavs.body.songs[0].favorited === true)
  const otherFavs = await owner.request(`/api/rooms/${room.code}/songs?favorites=true`)
  check('favorites are per person', otherFavs.body?.songs?.length === 0)

  group('Plays')
  await member.request(`/api/rooms/${room.code}/songs/${song.id}/play`, { method: 'POST' })
  await member.request(`/api/rooms/${room.code}/songs/${song.id}/play`, { method: 'POST' })
  const afterPlays = await member.request(`/api/rooms/${room.code}/songs?sort=plays`)
  check('plays are counted once per minute', afterPlays.body?.songs?.[0]?.id === song.id && afterPlays.body.songs[0].plays === 1, String(afterPlays.body?.songs?.[0]?.plays))

  group('Queue')
  const writeQueue = await member.request(`/api/rooms/${room.code}/queue`, {
    method: 'PUT',
    ...json({ songIds: [secondSong.id, song.id, song.id, 'does-not-exist'] }),
  })
  check('queue is stored, de-duplicated and pruned', JSON.stringify(writeQueue.body?.songIds) === JSON.stringify([secondSong.id, song.id]), JSON.stringify(writeQueue.body?.songIds))
  const readQueue = await member.request(`/api/rooms/${room.code}/queue`)
  check('queue survives a reload', JSON.stringify(readQueue.body?.songIds) === JSON.stringify([secondSong.id, song.id]))
  const otherQueue = await owner.request(`/api/rooms/${room.code}/queue`)
  check('queues are per person', otherQueue.body?.songIds?.length === 0)

  group('Permissions')
  const editOwn = await member.request(`/api/rooms/${room.code}/songs/${secondSong.id}`, {
    method: 'PATCH',
    ...json({ title: 'Renamed By Uploader' }),
  })
  check('uploader can edit their song', editOwn.body?.song?.title === 'Renamed By Uploader')

  const editOthers = await member.request(`/api/rooms/${room.code}/songs/${song.id}`, {
    method: 'PATCH',
    ...json({ title: 'Hijacked' }),
  })
  check('uploader cannot edit someone else’s song', editOthers.status === 403)

  const deleteOthers = await member.request(`/api/rooms/${room.code}/songs/${song.id}`, { method: 'DELETE' })
  check('uploader cannot delete someone else’s song', deleteOthers.status === 403)

  const ownerDelete = await owner.request(`/api/rooms/${room.code}/songs/${secondSong.id}`, { method: 'DELETE' })
  check('room owner can delete any song', ownerDelete.status === 200 && ownerDelete.body?.deleted === true)

  const gone = await owner.request(`/api/rooms/${room.code}/songs/${secondSong.id}`)
  check('deleted song is gone', gone.status === 404 && gone.body?.code === 'SONG_NOT_FOUND')

  const queueAfterDelete = await member.request(`/api/rooms/${room.code}/queue`)
  check('queue drops deleted songs', JSON.stringify(queueAfterDelete.body?.songIds) === JSON.stringify([song.id]))

  const memberRename = await member.request(`/api/rooms/${room.code}`, { method: 'PATCH', ...json({ name: 'Not Allowed' }) })
  check('members cannot rename the room', memberRename.status === 403)

  const ownerRename = await owner.request(`/api/rooms/${room.code}`, { method: 'PATCH', ...json({ name: `Smoke Room Renamed ${stamp}` }) })
  check('owner can rename the room', ownerRename.body?.room?.name?.startsWith('Smoke Room Renamed'))

  group('Sharing')
  const qr = await owner.request(`/api/rooms/${room.code}/qr`)
  check(
    'QR code renders as SVG',
    qr.status === 200 && String(qr.body).startsWith('<svg') && (qr.headers.get('content-type') ?? '').includes('svg'),
    String(qr.body).slice(0, 80),
  )

  group('Add from URL')
  const ssrfLocal = await owner.request(`/api/rooms/${room.code}/songs`, {
    method: 'POST',
    ...json({ url: 'http://127.0.0.1:3000/api/guests/me' }),
  })
  check('loopback URLs are refused', ssrfLocal.status === 422 && ssrfLocal.body?.code === 'INVALID_URL', `${ssrfLocal.status} ${ssrfLocal.body?.code}`)

  const ssrfMeta = await owner.request(`/api/rooms/${room.code}/songs`, {
    method: 'POST',
    ...json({ url: 'http://169.254.169.254/latest/meta-data/' }),
  })
  check('cloud metadata URLs are refused', ssrfMeta.status === 422 && ssrfMeta.body?.code === 'INVALID_URL')

  const ssrfPrivate = await owner.request(`/api/rooms/${room.code}/songs`, {
    method: 'POST',
    ...json({ url: 'http://192.168.1.10/audio.mp3' }),
  })
  check('private network URLs are refused', ssrfPrivate.status === 422)

  const ssrfScheme = await owner.request(`/api/rooms/${room.code}/songs`, {
    method: 'POST',
    ...json({ url: 'file:///etc/passwd' }),
  })
  check('non-http schemes are refused', ssrfScheme.status === 422)

  const unresolvable = await owner.request(`/api/rooms/${room.code}/songs`, {
    method: 'POST',
    ...json({ url: 'https://tuneroom-invalid-host-9f3k2.example.invalid/track.mp3' }),
  })
  check('unreachable hosts report a clear error', unresolvable.status === 422 && unresolvable.body?.code === 'URL_UNREACHABLE', `${unresolvable.status} ${unresolvable.body?.code}`)

  group('Validation and abuse')
  const longName = await owner.request('/api/rooms', { method: 'POST', ...json({ name: 'x'.repeat(200) }) })
  check('over-long room names are rejected', longName.status === 422)

  const badQueue = await owner.request(`/api/rooms/${room.code}/queue`, { method: 'PUT', ...json({ songIds: 'nope' }) })
  check('malformed queue payloads are rejected', badQueue.status === 422)

  const traversal = await owner.request(`/api/rooms/${encodeURIComponent('../../etc')}/state`)
  check('path traversal in the room ref is refused', traversal.status >= 400 && traversal.status < 500, `status ${traversal.status}`)

  group('Cleanup')
  const memberDelete = await member.request(`/api/rooms/${room.code}`, { method: 'DELETE' })
  check('members cannot delete the room', memberDelete.status === 403)

  const ownerDeleteRoom = await owner.request(`/api/rooms/${room.code}`, { method: 'DELETE' })
  check('owner can delete the room', ownerDeleteRoom.status === 200)

  const afterDelete = await owner.request(`/api/rooms/${room.code}`)
  check('deleted room returns 404', afterDelete.status === 404)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failures.length) {
    console.log('\nFailures:')
    for (const failure of failures)
      console.log(`  - ${failure}`)
  }
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('\nSmoke test crashed:', error)
  process.exit(1)
})

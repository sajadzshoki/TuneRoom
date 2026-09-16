import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { favorites, guests, queues, songs } from '../db/schema'
import type { GuestRow, RoomRow, SongRow } from '../db/schema'
import type { SongDTO, SongQuery, SongSource } from '#shared/types'

/**
 * Room library service: every song read/write goes through here so handlers stay
 * thin and no query logic is duplicated.
 */

/** Hard ceiling for a single library response. Rooms are small by design. */
export const MAX_SONGS_PER_RESPONSE = 1000

export interface SongListRow {
  song: SongRow
  uploaderName: string
  uploaderAvatar: string
  favoritedAt: Date | null
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, character => `\\${character}`)
}

export async function listSongs(
  room: RoomRow,
  viewer: GuestRow | null,
  query: SongQuery = {},
): Promise<SongDTO[]> {
  if (query.favorites && !viewer)
    return []

  const database = await db()
  const viewerId = viewer?.id ?? ''

  const conditions: SQL[] = [eq(songs.roomId, room.id)]

  const term = query.q?.trim()
  if (term) {
    const pattern = `%${escapeLike(term)}%`
    conditions.push(
      sql`(${songs.title} ILIKE ${pattern} OR ${songs.artist} ILIKE ${pattern} OR ${songs.album} ILIKE ${pattern})`,
    )
  }

  if (query.favorites)
    conditions.push(isNotNull(favorites.guestId))

  const orderBy = buildOrderBy(query.sort)

  const rows = await database
    .select({
      song: songs,
      uploaderName: guests.name,
      uploaderAvatar: guests.avatar,
      favoritedAt: favorites.createdAt,
    })
    .from(songs)
    .innerJoin(guests, eq(guests.id, songs.uploaderId))
    .leftJoin(
      favorites,
      and(eq(favorites.songId, songs.id), eq(favorites.guestId, viewerId)),
    )
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(MAX_SONGS_PER_RESPONSE)

  return rows.map(row => serializeSong(row.song, {
    roomCode: room.code,
    roomOwnerId: room.ownerId,
    viewerId: viewer?.id ?? null,
    uploader: { id: row.song.uploaderId, name: row.uploaderName, avatar: row.uploaderAvatar },
    favorited: row.favoritedAt !== null,
  }))
}

function buildOrderBy(sort: SongQuery['sort']): SQL[] {
  switch (sort) {
    case 'plays':
      return [desc(songs.plays), desc(songs.createdAt)]
    case 'title':
      return [asc(sql`lower(${songs.title})`)]
    case 'artist':
      return [asc(sql`lower(${songs.artist})`), asc(sql`lower(${songs.title})`)]
    case 'recent':
    default:
      return [desc(songs.createdAt)]
  }
}

export async function findSong(roomId: string, songId: string): Promise<SongRow | null> {
  const database = await db()
  const rows = await database
    .select()
    .from(songs)
    .where(and(eq(songs.id, songId), eq(songs.roomId, roomId)))
    .limit(1)
  return rows[0] ?? null
}

export async function requireSong(roomId: string, songId: string): Promise<SongRow> {
  const song = await findSong(roomId, songId)
  if (!song)
    songNotFound()
  return song!
}

export interface NewSongInput {
  room: RoomRow
  uploader: GuestRow
  title: string
  artist: string | null
  album: string | null
  duration: number
  audioKey: string
  audioMime: string
  audioSize: number
  coverKey: string | null
  source: SongSource
  sourceUrl?: string | null
}

export async function insertSong(input: NewSongInput): Promise<SongRow> {
  const database = await db()
  const id = newId()
  const rows = await database
    .insert(songs)
    .values({
      id,
      roomId: input.room.id,
      uploaderId: input.uploader.id,
      title: input.title.slice(0, 200),
      artist: (input.artist ?? 'Unknown artist').slice(0, 200),
      album: input.album?.slice(0, 200) ?? null,
      duration: input.duration,
      audioKey: input.audioKey,
      audioMime: input.audioMime,
      audioSize: input.audioSize,
      coverKey: input.coverKey,
      source: input.source,
      sourceUrl: input.sourceUrl ?? null,
    })
    .returning()
  return rows[0]!
}

/** Uploader or room owner — the only two roles allowed to change a song. */
export function canManageSong(song: SongRow, viewerId: string | null, roomOwnerId: string): boolean {
  if (!viewerId)
    return false
  return viewerId === song.uploaderId || viewerId === roomOwnerId
}

export async function updateSongDetails(
  song: SongRow,
  patch: { title?: string, artist?: string, album?: string | null, coverKey?: string | null },
): Promise<SongRow> {
  const database = await db()
  const rows = await database
    .update(songs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(songs.id, song.id))
    .returning()
  return rows[0]!
}

/** Removes a song plus its audio and artwork from storage. */
export async function deleteSong(song: SongRow): Promise<void> {
  const database = await db()
  const storage = useObjectStorage()

  await database.delete(songs).where(eq(songs.id, song.id))

  // Queue rows hold song ids in a JSON array; prune the removed track.
  const affected = await database
    .select({ roomId: queues.roomId, guestId: queues.guestId, songIds: queues.songIds })
    .from(queues)
    .where(eq(queues.roomId, song.roomId))

  for (const row of affected) {
    if (!row.songIds.includes(song.id))
      continue
    await database
      .update(queues)
      .set({ songIds: row.songIds.filter(id => id !== song.id), updatedAt: new Date() })
      .where(and(eq(queues.roomId, row.roomId), eq(queues.guestId, row.guestId)))
  }

  await storage.remove(song.audioKey)
  if (song.coverKey)
    await storage.remove(song.coverKey)
}

/**
 * Registers a play. Ignored when the same guest played the same track in the
 * last minute, so reloading or seeking cannot inflate the counter.
 */
const recentPlays = new Map<string, number>()
const PLAY_DEDUPE_MS = 60_000

export async function registerPlay(roomId: string, songId: string, guestId: string): Promise<void> {
  const key = `${roomId}:${songId}:${guestId}`
  const now = Date.now()
  const last = recentPlays.get(key) ?? 0
  if (now - last < PLAY_DEDUPE_MS)
    return

  recentPlays.set(key, now)
  if (recentPlays.size > 20_000) {
    for (const [entryKey, time] of recentPlays) {
      if (now - time > PLAY_DEDUPE_MS)
        recentPlays.delete(entryKey)
    }
  }

  const database = await db()
  await database
    .update(songs)
    .set({ plays: sql`${songs.plays} + 1` })
    .where(and(eq(songs.id, songId), eq(songs.roomId, roomId)))
}

export async function isFavorite(songId: string, guestId: string | null): Promise<boolean> {
  if (!guestId)
    return false
  const database = await db()
  const rows = await database
    .select({ songId: favorites.songId })
    .from(favorites)
    .where(and(eq(favorites.songId, songId), eq(favorites.guestId, guestId)))
    .limit(1)
  return rows.length > 0
}

export async function setFavorite(songId: string, guestId: string, favorite: boolean): Promise<boolean> {
  const database = await db()

  if (favorite) {
    await database
      .insert(favorites)
      .values({ songId, guestId })
      .onConflictDoNothing()
    return true
  }

  await database
    .delete(favorites)
    .where(and(eq(favorites.songId, songId), eq(favorites.guestId, guestId)))
  return false
}

export async function favoriteIdsFor(roomId: string, guestId: string | null): Promise<string[]> {
  if (!guestId)
    return []
  const database = await db()
  const rows = await database
    .select({ id: favorites.songId })
    .from(favorites)
    .innerJoin(songs, eq(songs.id, favorites.songId))
    .where(and(eq(songs.roomId, roomId), eq(favorites.guestId, guestId)))
  return rows.map(row => row.id)
}

/** Drops queue entries that point at songs which no longer exist. */
export async function pruneQueue(songIds: string[], roomId: string): Promise<string[]> {
  if (songIds.length === 0)
    return []
  const database = await db()
  const rows = await database
    .select({ id: songs.id })
    .from(songs)
    .where(and(eq(songs.roomId, roomId), inArray(songs.id, songIds)))
  const alive = new Set(rows.map(row => row.id))
  return songIds.filter(id => alive.has(id))
}

/** Loads the guest row for an arbitrary id, or null when it is gone. */
export async function findGuest(guestId: string): Promise<GuestRow | null> {
  const database = await db()
  const rows = await database.select().from(guests).where(eq(guests.id, guestId)).limit(1)
  return rows[0] ?? null
}

/** Reads a guest's queue for a room, dropping ids that no longer exist. */
export async function readQueue(roomId: string, guestId: string | null): Promise<string[]> {
  if (!guestId)
    return []
  const database = await db()
  const rows = await database
    .select({ songIds: queues.songIds })
    .from(queues)
    .where(and(eq(queues.roomId, roomId), eq(queues.guestId, guestId)))
    .limit(1)

  const stored = rows[0]?.songIds ?? []
  if (stored.length === 0)
    return []

  const alive = await pruneQueue(stored, roomId)
  if (alive.length !== stored.length)
    await writeQueue(roomId, guestId, alive)
  return alive
}

/** Persists a guest's queue for a room. */
export async function writeQueue(roomId: string, guestId: string, songIds: string[]): Promise<string[]> {
  const database = await db()
  await database
    .insert(queues)
    .values({ roomId, guestId, songIds, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [queues.roomId, queues.guestId],
      set: { songIds, updatedAt: new Date() },
    })
  return songIds
}

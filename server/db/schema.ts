import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * TuneRoom data model.
 *
 * Deliberately small: five concepts (guest identity, room, membership/presence,
 * song, favorite) plus one per-guest playback queue. Every song belongs to a
 * room and every room has an owner, so the schema scales to thousands of rooms
 * without any change.
 *
 * The dialect is PostgreSQL. Local development uses PGlite (PostgreSQL compiled
 * to WASM) and production uses any PostgreSQL server — the exact same schema,
 * migrations and queries run against both.
 */

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
}

/** An anonymous person. No email, no password — just a name and an avatar. */
export const guests = pgTable(
  'guests',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** Key of one of the generated avatar presets (see `shared/avatars.ts`). */
    avatar: text('avatar').notNull(),
    createdAt: timestamps.createdAt,
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  table => [index('guests_last_seen_idx').on(table.lastSeenAt)],
)

/** A shared music room. */
export const rooms = pgTable(
  'rooms',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    /** Human friendly path segment, e.g. `office-music`. */
    slug: text('slug').notNull(),
    /** Short shareable code, e.g. `K7P9Q2`. */
    code: text('code').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  table => [
    uniqueIndex('rooms_slug_idx').on(table.slug),
    uniqueIndex('rooms_code_idx').on(table.code),
  ],
)

/** Membership + presence. `lastSeenAt` is refreshed by the client heartbeat. */
export const roomMembers = pgTable(
  'room_members',
  {
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  table => [
    primaryKey({ columns: [table.roomId, table.guestId] }),
    index('room_members_last_seen_idx').on(table.roomId, table.lastSeenAt),
  ],
)

/** A track inside a room library. Audio bytes live in object storage, not here. */
export const songs = pgTable(
  'songs',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    uploaderId: text('uploader_id')
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    artist: text('artist').notNull().default('Unknown artist'),
    album: text('album'),
    /** Duration in whole seconds. */
    duration: integer('duration').notNull().default(0),
    /** Object storage key of the cover artwork, if any. */
    coverKey: text('cover_key'),
    /** Object storage key of the audio file. Never a public URL. */
    audioKey: text('audio_key').notNull(),
    audioMime: text('audio_mime').notNull(),
    audioSize: integer('audio_size').notNull().default(0),
    /** How the track entered the room: `upload` or `url`. */
    source: text('source').notNull().default('upload'),
    /** Original remote URL when `source` is `url`. */
    sourceUrl: text('source_url'),
    plays: integer('plays').notNull().default(0),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  table => [
    index('songs_room_created_idx').on(table.roomId, table.createdAt),
    index('songs_room_title_idx').on(table.roomId, table.title),
  ],
)

/** Per-guest favorite. */
export const favorites = pgTable(
  'favorites',
  {
    songId: text('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
  },
  table => [primaryKey({ columns: [table.songId, table.guestId] })],
)

/** Per-guest, per-room playback queue (ordered list of song ids). */
export const queues = pgTable(
  'queues',
  {
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    songIds: jsonb('song_ids').$type<string[]>().notNull().default([]),
    updatedAt: timestamps.updatedAt,
  },
  table => [primaryKey({ columns: [table.roomId, table.guestId] })],
)

export type GuestRow = typeof guests.$inferSelect
export type RoomRow = typeof rooms.$inferSelect
export type RoomMemberRow = typeof roomMembers.$inferSelect
export type SongRow = typeof songs.$inferSelect
export type FavoriteRow = typeof favorites.$inferSelect
export type QueueRow = typeof queues.$inferSelect

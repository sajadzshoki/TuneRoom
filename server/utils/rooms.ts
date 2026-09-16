import { and, desc, eq, gt, sql } from 'drizzle-orm'
import { guests, roomMembers, rooms, songs } from '../db/schema'
import type { GuestRow, RoomRow } from '../db/schema'
import type { MemberDTO, RoomDTO } from '#shared/types'

/**
 * Room lookup, membership and presence.
 *
 * Presence is a lightweight heartbeat: clients ping the room every 20 seconds
 * and anyone seen within the last minute counts as online. No websockets, no
 * pub/sub, no infrastructure — and it works identically in dev and production.
 */
export const PRESENCE_TTL_MS = 60_000
export const HEARTBEAT_INTERVAL_MS = 20_000

export function presenceCutoff(): Date {
  return new Date(Date.now() - PRESENCE_TTL_MS)
}

/** Rooms are addressable by short code (`K7P9Q2`) or by slug (`office-music`). */
export async function findRoomByRef(ref: string): Promise<RoomRow | null> {
  const value = (ref ?? '').trim()
  if (!value || value.length > 80)
    return null

  const database = await db()
  const rows = await database
    .select()
    .from(rooms)
    .where(
      sql`${rooms.code} = ${value.toUpperCase()} OR ${rooms.slug} = ${value.toLowerCase()}`,
    )
    .limit(1)

  return rows[0] ?? null
}

export async function requireRoom(ref: string): Promise<RoomRow> {
  const room = await findRoomByRef(ref)
  if (!room)
    roomNotFound()
  return room!
}

export async function isMemberOf(roomId: string, guestId: string | null): Promise<boolean> {
  if (!guestId)
    return false
  const database = await db()
  const rows = await database
    .select({ guestId: roomMembers.guestId })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.guestId, guestId)))
    .limit(1)
  return rows.length > 0
}

/** Idempotent join: first call records membership, later calls refresh presence. */
export async function joinRoom(roomId: string, guestId: string): Promise<void> {
  const database = await db()
  await database
    .insert(roomMembers)
    .values({ roomId, guestId, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: [roomMembers.roomId, roomMembers.guestId],
      set: { lastSeenAt: new Date() },
    })
}

export async function requireMembership(room: RoomRow, guest: GuestRow | null): Promise<GuestRow> {
  if (!guest)
    unauthenticated()
  const member = await isMemberOf(room.id, guest!.id)
  if (!member)
    notAMember()
  return guest!
}

/** Records activity for both the membership row and the guest row. */
export async function touchPresence(roomId: string, guestId: string): Promise<void> {
  const database = await db()
  const now = new Date()
  await database
    .update(roomMembers)
    .set({ lastSeenAt: now })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.guestId, guestId)))
  await database
    .update(guests)
    .set({ lastSeenAt: now })
    .where(eq(guests.id, guestId))
}

export async function countOnline(roomId: string): Promise<number> {
  const database = await db()
  const rows = await database
    .select({ value: sql<number>`count(*)::int` })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), gt(roomMembers.lastSeenAt, presenceCutoff())))
  return rows[0]?.value ?? 0
}

export async function countSongs(roomId: string): Promise<number> {
  const database = await db()
  const rows = await database
    .select({ value: sql<number>`count(*)::int` })
    .from(songs)
    .where(eq(songs.roomId, roomId))
  return rows[0]?.value ?? 0
}

/** Cap for the member list: a room with thousands of visitors stays cheap. */
export const MEMBER_LIST_LIMIT = 60

/**
 * Everyone who has joined the room, most recently seen first, with the viewer
 * marked. Online means "seen within the presence window"; the rest are shown as
 * away with their last-seen time so the room still feels inhabited.
 */
export async function listMembers(room: RoomRow, viewerId?: string | null): Promise<MemberDTO[]> {
  const database = await db()
  const cutoff = presenceCutoff().getTime()

  const rows = await database
    .select({
      guestId: roomMembers.guestId,
      joinedAt: roomMembers.joinedAt,
      lastSeenAt: roomMembers.lastSeenAt,
      name: guests.name,
      avatar: guests.avatar,
    })
    .from(roomMembers)
    .innerJoin(guests, eq(guests.id, roomMembers.guestId))
    .where(eq(roomMembers.roomId, room.id))
    .orderBy(desc(roomMembers.lastSeenAt))
    .limit(MEMBER_LIST_LIMIT)

  const members = rows.map<MemberDTO>(row => ({
    id: row.guestId,
    name: row.name,
    avatar: row.avatar,
    online: row.lastSeenAt.getTime() > cutoff,
    isOwner: row.guestId === room.ownerId,
    isYou: row.guestId === viewerId,
    joinedAt: row.joinedAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  }))

  // You first, then online, then in the order people arrived.
  return members.sort((a, b) =>
    Number(b.isYou) - Number(a.isYou)
    || Number(b.online) - Number(a.online)
    || a.joinedAt.localeCompare(b.joinedAt))
}

/** Generates a room slug that does not collide with an existing one. */
export async function uniqueSlug(name: string): Promise<string> {
  const database = await db()
  const base = slugify(name)

  for (let attempt = 0; attempt < 40; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    const clash = await database
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.slug, candidate))
      .limit(1)
    if (clash.length === 0)
      return candidate
  }

  return `${base}-${newId(4)}`
}

/** Generates a room code that does not collide with an existing one. */
export async function uniqueRoomCode(): Promise<string> {
  const database = await db()
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = newRoomCode()
    const clash = await database
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.code, candidate))
      .limit(1)
    if (clash.length === 0)
      return candidate
  }
  throw apiError(500, ErrorCode.INTERNAL, 'Could not allocate a room code. Please try again.')
}

/** Builds the public room representation (counts + owner + viewer flags). */
export async function buildRoomDTO(room: RoomRow, viewer: GuestRow | null): Promise<RoomDTO> {
  const database = await db()
  const viewerId = viewer?.id ?? null

  const [songCount, onlineCount, isMember, ownerRows] = await Promise.all([
    countSongs(room.id),
    countOnline(room.id),
    isMemberOf(room.id, viewerId),
    database.select().from(guests).where(eq(guests.id, room.ownerId)).limit(1),
  ])

  return serializeRoom(room, {
    owner: ownerRows[0] ?? null,
    songCount,
    onlineCount,
    viewerId,
    isMember,
  })
}

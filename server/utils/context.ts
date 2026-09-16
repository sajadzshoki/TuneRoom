import type { H3Event } from 'h3'
import type { GuestRow, RoomRow, SongRow } from '../db/schema'

/**
 * Request context helpers.
 *
 * Every room-scoped handler resolves the room and the caller the same way:
 * the room comes from the URL, the caller always comes from the signed
 * identity cookie — never from the request body.
 */

export interface RoomRequestContext {
  room: RoomRow
  guest: GuestRow | null
}

export interface SongRequestContext extends RoomRequestContext {
  song: SongRow
}

export interface RoomContextOptions {
  /** When true (default) the caller must already have joined the room. */
  member?: boolean
}

export function roomRefFromEvent(event: H3Event): string {
  const params = getRouterParams(event, { decode: true })
  return parseWith(roomCodeParamSchema, params.code)
}

function songIdFromEvent(event: H3Event): string {
  const params = getRouterParams(event, { decode: true })
  return parseWith(songIdParamSchema, params.id)
}

export async function useRoomContext(event: H3Event, options: RoomContextOptions = {}): Promise<RoomRequestContext> {
  const requireMember = options.member ?? true
  const room = await requireRoom(roomRefFromEvent(event))
  const guest = await currentGuest(event)

  if (requireMember)
    await requireMembership(room, guest)

  return { room, guest }
}

export async function useSongContext(event: H3Event, options: RoomContextOptions = {}): Promise<SongRequestContext> {
  const requireMember = options.member ?? true
  const room = await requireRoom(roomRefFromEvent(event))
  const guest = await currentGuest(event)

  if (requireMember)
    await requireMembership(room, guest)

  const song = await requireSong(room.id, songIdFromEvent(event))
  return { room, guest, song }
}

/** Absolute origin used for share links and QR codes. */
export function appOrigin(event: H3Event): string {
  const configured = serverConfig().appUrl
  if (configured)
    return configured
  return getRequestURL(event).origin
}

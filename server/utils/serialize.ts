import type { GuestRow, RoomRow, SongRow } from '../db/schema'
import type { GuestDTO, RoomDTO, SongDTO, SongSource, UploaderDTO } from '#shared/types'

/**
 * Row -> DTO mapping.
 *
 * Storage keys never leave the server. Clients only receive route URLs, so the
 * storage layout (and the driver behind it) can change freely.
 */

export function songAudioUrl(roomCode: string, songId: string): string {
  return `/api/rooms/${encodeURIComponent(roomCode)}/songs/${encodeURIComponent(songId)}/audio`
}

export function songCoverUrl(roomCode: string, songId: string, version?: number): string {
  const base = `/api/rooms/${encodeURIComponent(roomCode)}/songs/${encodeURIComponent(songId)}/cover`
  return version ? `${base}?v=${version}` : base
}

export function songDownloadUrl(roomCode: string, songId: string): string {
  return `${songAudioUrl(roomCode, songId)}?download=1`
}

export function serializeGuest(guest: GuestRow): GuestDTO {
  return {
    id: guest.id,
    name: guest.name,
    avatar: guest.avatar,
    lastSeenAt: guest.lastSeenAt.toISOString(),
  }
}

export function serializeUploader(guest: Pick<GuestRow, 'id' | 'name' | 'avatar'>): UploaderDTO {
  return { id: guest.id, name: guest.name, avatar: guest.avatar }
}

export interface RoomContext {
  owner: Pick<GuestRow, 'id' | 'name' | 'avatar'> | null
  songCount: number
  onlineCount: number
  viewerId: string | null
  isMember: boolean
}

export function serializeRoom(room: RoomRow, context: RoomContext): RoomDTO {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    slug: room.slug,
    code: room.code,
    ownerId: room.ownerId,
    owner: context.owner ? serializeUploader(context.owner) : null,
    songCount: context.songCount,
    onlineCount: context.onlineCount,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    isOwner: context.viewerId !== null && context.viewerId === room.ownerId,
    isMember: context.isMember,
  }
}

export interface SongContext {
  roomCode: string
  roomOwnerId: string
  viewerId: string | null
  uploader: Pick<GuestRow, 'id' | 'name' | 'avatar'>
  favorited: boolean
}

export function serializeSong(song: SongRow, context: SongContext): SongDTO {
  return {
    id: song.id,
    roomId: song.roomId,
    title: song.title,
    artist: song.artist,
    album: song.album,
    duration: song.duration,
    coverUrl: song.coverKey ? songCoverUrl(context.roomCode, song.id, song.updatedAt.getTime()) : null,
    audioUrl: songAudioUrl(context.roomCode, song.id),
    downloadUrl: songDownloadUrl(context.roomCode, song.id),
    source: song.source as SongSource,
    sourceUrl: song.sourceUrl,
    plays: song.plays,
    createdAt: song.createdAt.toISOString(),
    uploader: serializeUploader(context.uploader),
    favorited: context.favorited,
    canManage: context.viewerId !== null
      && (context.viewerId === song.uploaderId || context.viewerId === context.roomOwnerId),
  }
}

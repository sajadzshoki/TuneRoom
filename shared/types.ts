/**
 * Shared API contracts.
 *
 * Everything the client renders comes from these DTOs. The server maps
 * database rows to DTOs in `server/utils/serialize.ts`, so the shape sent over
 * the wire never depends on the storage layout (no storage keys, no raw rows).
 */

export type SongSource = 'upload' | 'url'

export interface GuestDTO {
  id: string
  name: string
  avatar: string
  lastSeenAt: string
}

export interface UploaderDTO {
  id: string
  name: string
  avatar: string
}

export interface RoomDTO {
  id: string
  name: string
  description: string | null
  slug: string
  code: string
  ownerId: string
  owner: UploaderDTO | null
  songCount: number
  onlineCount: number
  createdAt: string
  updatedAt: string
  /** True when the requester created the room. */
  isOwner: boolean
  /** True when the requester already joined the room. */
  isMember: boolean
}

export interface SongDTO {
  id: string
  roomId: string
  title: string
  artist: string
  album: string | null
  duration: number
  coverUrl: string | null
  audioUrl: string
  /** Same audio endpoint with an attachment disposition, for saving the file. */
  downloadUrl: string
  source: SongSource
  sourceUrl: string | null
  plays: number
  createdAt: string
  uploader: UploaderDTO
  favorited: boolean
  /** True when the requester may delete or edit this song. */
  canManage: boolean
}

/** Returned by the upload endpoint when tags were missing from the file. */
export interface UploadResultDTO {
  song: SongDTO
  /** True when no title/artist tags were found and the uploader should review. */
  needsMetadata: boolean
}

export interface MemberDTO {
  id: string
  name: string
  avatar: string
  online: boolean
  isOwner: boolean
  isYou: boolean
  joinedAt: string
  lastSeenAt: string
}

export interface PresenceDTO {
  members: MemberDTO[]
  onlineCount: number
}

export interface QueueDTO {
  songIds: string[]
}

export interface RoomStateDTO {
  room: RoomDTO
  songs: SongDTO[]
  members: MemberDTO[]
  queue: string[]
}

/** Every API error is serialised into this shape. */
export interface ApiErrorBody {
  /** Stable machine readable code, e.g. `ROOM_NOT_FOUND`. */
  code: string
  /** Human readable, safe to show in the UI. */
  message: string
  details?: Record<string, unknown>
}

export type SortKey = 'recent' | 'plays' | 'title' | 'artist'

export interface SongQuery {
  q?: string
  sort?: SortKey
  favorites?: boolean
}

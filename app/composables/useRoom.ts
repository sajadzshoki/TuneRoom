import type { MemberDTO, RoomDTO, SongDTO, SortKey } from '#shared/types'
import type { ApiFailure } from '~/utils/api'

/**
 * Room session: the library, the people online and the view preferences for the
 * room currently open. Global state so the player, the queue drawer and the
 * library all read the same data.
 */
export interface RoomSession {
  /** The reference used in URLs — the slug when known, otherwise the code. */
  ref: string | null
  room: RoomDTO | null
  songs: SongDTO[]
  members: MemberDTO[]
  search: string
  sort: SortKey
  favoritesOnly: boolean
  view: 'grid' | 'list'
  loading: boolean
  error: ApiFailure | null
  /** 404: the room does not exist (bad link or deleted). */
  missing: boolean
  /** 401/403: the room exists but this visitor has not joined yet. */
  needsJoin: boolean
}

const VIEW_COOKIE = 'tuneroom:view'

function initialSession(): RoomSession {
  return {
    ref: null,
    room: null,
    songs: [],
    members: [],
    search: '',
    sort: 'recent',
    favoritesOnly: false,
    view: 'grid',
    loading: true,
    error: null,
    missing: false,
    needsJoin: false,
  }
}

export function useRoom() {
  /**
   * The grid/list choice lives in a cookie, not localStorage: the server can
   * read it, so the first render already matches the visitor's preference
   * instead of flashing the other layout after hydration.
   */
  const viewCookie = useCookie<'grid' | 'list' | null>(VIEW_COOKIE, {
    default: () => null,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })

  const viewFromCookie = (): 'grid' | 'list' => (viewCookie.value === 'list' ? 'list' : 'grid')

  const session = useState<RoomSession>('room:session', () => ({
    ...initialSession(),
    view: viewFromCookie(),
  }))
  const favorites = useState<Record<string, boolean>>('room:favorites', () => ({}))
  const api = useApi()
  const player = usePlayer()

  const songs = computed(() => session.value.songs)
  const room = computed(() => session.value.room)
  const members = computed(() => session.value.members)
  const onlineCount = computed(() => session.value.members.filter(member => member.online).length)

  /** Search + sort + favorites applied in memory: instant, no round trips. */
  const visibleSongs = computed<SongDTO[]>(() => {
    const term = session.value.search.trim().toLowerCase()
    let list = session.value.songs

    if (session.value.favoritesOnly)
      list = list.filter(song => favorites.value[song.id] === true)

    if (term) {
      list = list.filter(song =>
        song.title.toLowerCase().includes(term)
        || song.artist.toLowerCase().includes(term)
        || (song.album ?? '').toLowerCase().includes(term)
        || song.uploader.name.toLowerCase().includes(term),
      )
    }

    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
    const sorted = [...list]
    switch (session.value.sort) {
      case 'plays':
        sorted.sort((a, b) => b.plays - a.plays || b.createdAt.localeCompare(a.createdAt))
        break
      case 'title':
        sorted.sort((a, b) => collator.compare(a.title, b.title))
        break
      case 'artist':
        sorted.sort((a, b) => collator.compare(a.artist, b.artist) || collator.compare(a.title, b.title))
        break
      case 'recent':
      default:
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }
    return sorted
  })

  function setView(view: 'grid' | 'list'): void {
    session.value.view = view
    viewCookie.value = view
  }

  /**
   * First visit only: phones start on the compact list, wide screens on the
   * grid. Called after hydration (the server cannot know the viewport) and
   * remembered in the cookie, so later visits render it directly.
   */
  function applyDefaultView(): void {
    if (!import.meta.client || viewCookie.value)
      return
    setView(window.matchMedia('(min-width: 40rem)').matches ? 'grid' : 'list')
  }

  /** Replaces the whole session after a successful `/state` load. */
  function hydrate(ref: string, payload: { room: RoomDTO, songs: SongDTO[], members: MemberDTO[], queue: string[] }): void {
    const next: Record<string, boolean> = {}
    for (const song of payload.songs)
      next[song.id] = song.favorited

    session.value = {
      ...session.value,
      ref,
      room: payload.room,
      songs: payload.songs,
      members: payload.members,
      loading: false,
      error: null,
      missing: false,
      needsJoin: false,
    }
    favorites.value = next
    player.setRoomCode(payload.room.code)

    // Restore the persisted queue, keeping only tracks that still exist.
    const byId = new Map(payload.songs.map(song => [song.id, song]))
    player.hydrateQueue(payload.queue.map(id => byId.get(id)).filter((song): song is SongDTO => Boolean(song)))
  }

  function reset(): void {
    session.value = { ...initialSession(), view: viewFromCookie() }
    favorites.value = {}
    player.setRoomCode(null)
  }

  function setFailure(error: ApiFailure, ref: string): void {
    session.value = {
      ...initialSession(),
      view: viewFromCookie(),
      ref,
      loading: false,
      error,
      missing: error.status === 404 || error.code === 'ROOM_NOT_FOUND',
      needsJoin: error.status === 401 || error.status === 403,
    }
    favorites.value = {}
    player.setRoomCode(null)
  }

  function setLoading(loading: boolean): void {
    session.value.loading = loading
  }

  /** Replaces the room record after an owner edit (name, description, slug). */
  function setRoom(updated: RoomDTO): void {
    session.value.room = updated
  }

  function setMembers(members: MemberDTO[]): void {
    session.value.members = members
  }

  /* ------------------------------------------------------------- mutations */

  function addSong(song: SongDTO): void {
    session.value.songs = [song, ...session.value.songs.filter(item => item.id !== song.id)]
    favorites.value = { ...favorites.value, [song.id]: song.favorited }
    if (session.value.room) {
      session.value.room = { ...session.value.room, songCount: session.value.room.songCount + 1 }
    }
  }

  function replaceSong(song: SongDTO): void {
    session.value.songs = session.value.songs.map(item => (item.id === song.id ? song : item))
    favorites.value = { ...favorites.value, [song.id]: song.favorited }
    player.updateSong(song)
  }

  function removeSong(songId: string): void {
    const removed = session.value.songs.find(song => song.id === songId)
    session.value.songs = session.value.songs.filter(song => song.id !== songId)
    favorites.value = Object.fromEntries(
      Object.entries(favorites.value).filter(([id]) => id !== songId),
    )
    if (session.value.room && removed) {
      session.value.room = {
        ...session.value.room,
        songCount: Math.max(0, session.value.room.songCount - 1),
      }
    }
    player.forgetSong(songId)
  }

  async function toggleFavorite(song: SongDTO): Promise<boolean> {
    const code = session.value.room?.code
    if (!code)
      return song.favorited

    const desired = !(favorites.value[song.id] ?? song.favorited)
    // Optimistic: the heart responds immediately, the request confirms it.
    favorites.value = { ...favorites.value, [song.id]: desired }

    try {
      const result = await api.post<{ favorited: boolean }>(
        `/api/rooms/${code}/songs/${song.id}/favorite`,
        { favorite: desired },
      )
      favorites.value = { ...favorites.value, [song.id]: result.favorited }
      session.value.songs = session.value.songs.map(item =>
        item.id === song.id ? { ...item, favorited: result.favorited } : item,
      )
      return result.favorited
    }
    catch (error) {
      favorites.value = { ...favorites.value, [song.id]: !desired }
      api.notify(error)
      return !desired
    }
  }

  /**
   * Merges a freshly fetched library (background poll) without touching the
   * queue or the view preferences, so a poll can never undo a local change.
   * Songs that disappeared are dropped from the player as well.
   */
  function applySongs(next: SongDTO[]): void {
    const previous = session.value.songs
    const kept = new Set(next.map(song => song.id))

    session.value.songs = next
    if (session.value.room) {
      session.value.room = { ...session.value.room, songCount: next.length }
    }

    const map: Record<string, boolean> = {}
    for (const song of next)
      map[song.id] = song.favorited
    favorites.value = map

    for (const song of previous) {
      if (!kept.has(song.id))
        player.forgetSong(song.id)
    }
  }

  function isFavorite(songId: string): boolean {
    return favorites.value[songId] === true
  }

  async function removeSongRemote(song: SongDTO): Promise<void> {
    const code = session.value.room?.code
    if (!code)
      return
    await api.delete(`/api/rooms/${code}/songs/${song.id}`)
    removeSong(song.id)
  }

  return {
    session,
    songs,
    room,
    members,
    onlineCount,
    visibleSongs,
    favorites,
    hydrate,
    reset,
    setFailure,
    setLoading,
    setMembers,
    setRoom,
    setView,
    applyDefaultView,
    addSong,
    replaceSong,
    removeSong,
    removeSongRemote,
    applySongs,
    toggleFavorite,
    isFavorite,
  }
}

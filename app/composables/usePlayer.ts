import type { SongDTO } from '#shared/types'

/**
 * The global playback engine.
 *
 * State lives in `useState`, so it survives route changes, and the `<audio>`
 * element is owned by `AudioEngine.vue` (mounted once in `app.vue`). Navigating
 * inside the app therefore never interrupts a track.
 *
 * Playback is deliberately personal: nothing here is synchronised between
 * people. The room shares the library, not the playhead.
 */

export type RepeatMode = 'off' | 'all' | 'one'

export interface PlayerState {
  /** The list the user started playback from. */
  tracks: SongDTO[]
  index: number
  /** Explicit "play next" / "add to queue" items. */
  queue: SongDTO[]
  /** Previously played indices, so `previous` undoes shuffle. */
  history: number[]
  playing: boolean
  position: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  buffering: boolean
  /** Mobile: full-screen player is open. */
  expanded: boolean
  queueOpen: boolean
  error: string | null
  /** Room the current queue belongs to (queues are stored per room). */
  roomCode: string | null
}

const HISTORY_LIMIT = 60
const STORAGE_KEYS = {
  volume: 'tuneroom:volume',
  muted: 'tuneroom:muted',
  shuffle: 'tuneroom:shuffle',
  repeat: 'tuneroom:repeat',
} as const

function initialState(): PlayerState {
  return {
    tracks: [],
    index: -1,
    queue: [],
    history: [],
    playing: false,
    position: 0,
    duration: 0,
    volume: 0.9,
    muted: false,
    shuffle: false,
    repeat: 'off',
    buffering: false,
    expanded: false,
    queueOpen: false,
    error: null,
    roomCode: null,
  }
}

function readNumber(key: string, fallback: number): number {
  if (!import.meta.client)
    return fallback
  const raw = Number(window.localStorage.getItem(key))
  return Number.isFinite(raw) ? raw : fallback
}

function readBoolean(key: string, fallback: boolean): boolean {
  if (!import.meta.client)
    return fallback
  const raw = window.localStorage.getItem(key)
  return raw === null ? fallback : raw === '1'
}

function readRepeat(key: string, fallback: RepeatMode): RepeatMode {
  if (!import.meta.client)
    return fallback
  const raw = window.localStorage.getItem(key)
  return raw === 'all' || raw === 'one' || raw === 'off' ? raw : fallback
}

function write(key: string, value: string | null): void {
  if (!import.meta.client)
    return
  try {
    if (value === null)
      window.localStorage.removeItem(key)
    else
      window.localStorage.setItem(key, value)
  }
  catch {
    // Private browsing or a full quota must never break playback.
  }
}

/* Engine singletons: `usePlayer()` is called from many components, but there is
   exactly one audio element, one position ticker and one queue-write timer. */
let audio: HTMLAudioElement | null = null
let frame = 0
let consecutiveErrors = 0
let playedSongId: string | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
let preferencesRestored = false

export function usePlayer() {
  const state = useState<PlayerState>('player', initialState)
  const api = useApi()

  // Restored once on the client so the server render stays deterministic.
  if (import.meta.client && !preferencesRestored) {
    preferencesRestored = true
    state.value = {
      ...state.value,
      volume: Math.min(1, Math.max(0, readNumber(STORAGE_KEYS.volume, 0.9))),
      muted: readBoolean(STORAGE_KEYS.muted, false),
      shuffle: readBoolean(STORAGE_KEYS.shuffle, false),
      repeat: readRepeat(STORAGE_KEYS.repeat, 'off'),
    }
  }

  const current = computed<SongDTO | null>(() => {
    const { index, tracks } = state.value
    return index >= 0 ? (tracks[index] ?? null) : null
  })

  const hasTrack = computed(() => current.value !== null)
  const progress = computed(() =>
    state.value.duration > 0 ? (state.value.position / state.value.duration) * 100 : 0,
  )

  /* ---------------------------------------------------------------- engine */

  function stopTicker(): void {
    if (!frame)
      return
    cancelAnimationFrame(frame)
    frame = 0
  }

  function startTicker(): void {
    if (!import.meta.client || frame)
      return
    const tick = () => {
      frame = 0
      if (audio && state.value.playing) {
        // Only publish meaningful changes so Vue does not re-render 60x/second.
        if (Math.abs(audio.currentTime - state.value.position) >= 0.1)
          state.value.position = audio.currentTime
        frame = requestAnimationFrame(tick)
      }
    }
    frame = requestAnimationFrame(tick)
  }

  function updateMediaSession(song: SongDTO | null): void {
    if (!import.meta.client || !('mediaSession' in navigator))
      return

    if (!song) {
      navigator.mediaSession.metadata = null
      return
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.album ?? 'TuneRoom',
      artwork: song.coverUrl ? [{ src: song.coverUrl, sizes: '512x512' }] : [],
    })
  }

  function bindListeners(): void {
    if (!audio)
      return

    audio.addEventListener('play', () => {
      state.value.playing = true
      state.value.error = null
      startTicker()
    })
    audio.addEventListener('pause', () => {
      state.value.playing = false
      stopTicker()
    })
    audio.addEventListener('waiting', () => {
      state.value.buffering = true
    })
    audio.addEventListener('playing', () => {
      state.value.buffering = false
      consecutiveErrors = 0
    })
    audio.addEventListener('canplay', () => {
      state.value.buffering = false
    })
    audio.addEventListener('durationchange', () => {
      if (audio && Number.isFinite(audio.duration))
        state.value.duration = audio.duration
    })
    audio.addEventListener('timeupdate', () => {
      // While playing, the rAF ticker owns `position`; this covers the paused
      // and seeking cases, where the ticker is stopped.
      if (audio && !state.value.playing)
        state.value.position = audio.currentTime
    })
    audio.addEventListener('ended', () => {
      state.value.playing = false
      stopTicker()
      handleEnded()
    })
    audio.addEventListener('error', () => {
      state.value.buffering = false
      state.value.playing = false
      stopTicker()
      handleMediaError()
    })
    audio.addEventListener('volumechange', () => {
      if (!audio)
        return
      state.value.volume = audio.volume
      state.value.muted = audio.muted
    })
  }

  /** Called once by `AudioEngine.vue`; the element then lives for the session. */
  function attach(element: HTMLAudioElement): void {
    if (audio === element)
      return
    detach()
    audio = element
    audio.preload = 'metadata'
    audio.volume = state.value.volume
    audio.muted = state.value.muted
    bindListeners()

    // A track may already be selected when the engine mounts (hot reload).
    const song = current.value
    if (song && !audio.src) {
      audio.src = song.audioUrl
      updateMediaSession(song)
    }
  }

  function detach(): void {
    stopTicker()
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    audio = null
  }

  function handleMediaError(): void {
    if (!current.value)
      return

    consecutiveErrors += 1
    const message = consecutiveErrors >= 3
      ? 'Playback stopped. Some tracks in this room could not be loaded.'
      : `"${current.value.title}" is no longer available.`

    state.value.error = message
    api.toast.add({
      color: 'error',
      title: message,
      icon: 'i-lucide-triangle-alert',
      duration: 4000,
    })

    if (consecutiveErrors < 3)
      setTimeout(() => next(true), 300)
  }

  function registerPlay(song: SongDTO): void {
    if (!state.value.roomCode || playedSongId === song.id)
      return
    playedSongId = song.id
    // Fire and forget: play counts must never block or break playback.
    api
      .post(`/api/rooms/${state.value.roomCode}/songs/${song.id}/play`, {})
      .catch(() => {})
  }

  async function startPlayback(): Promise<void> {
    if (!audio)
      return
    try {
      await audio.play()
      const song = current.value
      if (song) {
        registerPlay(song)
        updateMediaSession(song)
      }
    }
    catch (error) {
      const name = (error as { name?: string })?.name
      if (name === 'NotAllowedError') {
        state.value.error = 'Press play to start the audio.'
        return
      }
      if (name !== 'AbortError')
        handleMediaError()
    }
  }

  /* ------------------------------------------------------------ navigation */

  function loadIndex(index: number, options: { autoplay?: boolean, pushHistory?: boolean } = {}): void {
    const { autoplay = true, pushHistory = true } = options
    const tracks = state.value.tracks
    if (index < 0 || index >= tracks.length)
      return

    if (pushHistory && state.value.index >= 0 && state.value.index !== index) {
      state.value.history = [...state.value.history, state.value.index].slice(-HISTORY_LIMIT)
    }

    state.value.index = index
    state.value.position = 0
    state.value.duration = tracks[index]!.duration || 0
    state.value.error = null
    playedSongId = null

    if (audio) {
      state.value.buffering = true
      audio.src = tracks[index]!.audioUrl
      audio.load()
    }

    updateMediaSession(tracks[index]!)
    if (autoplay)
      void startPlayback()
  }

  /** Starts playback from a list (the visible library, a playlist, search…). */
  function playContext(tracks: SongDTO[], index: number): void {
    if (!tracks.length)
      return
    state.value.tracks = [...tracks]
    state.value.history = []
    loadIndex(Math.min(Math.max(index, 0), tracks.length - 1))
  }

  /** Plays one song, reusing the current context when it already contains it. */
  function playSong(song: SongDTO): void {
    const existing = state.value.tracks.findIndex(track => track.id === song.id)
    if (existing >= 0) {
      if (existing === state.value.index && state.value.playing)
        pause()
      else if (existing === state.value.index)
        void startPlayback()
      else
        loadIndex(existing)
      return
    }

    if (state.value.tracks.length === 0) {
      playContext([song], 0)
      return
    }

    state.value.tracks = [...state.value.tracks, song]
    loadIndex(state.value.tracks.length - 1)
  }

  function toggle(): void {
    if (!current.value)
      return
    if (state.value.playing)
      pause()
    else
      void startPlayback()
  }

  function pause(): void {
    audio?.pause()
    state.value.playing = false
    stopTicker()
  }

  function next(auto = false): void {
    if (state.value.queue.length > 0) {
      const [song, ...rest] = state.value.queue
      state.value.queue = rest
      syncQueue()
      if (song)
        playSong(song)
      return
    }

    const total = state.value.tracks.length
    if (total === 0) {
      pause()
      return
    }

    if (state.value.shuffle && total > 1) {
      let pick = state.value.index
      while (pick === state.value.index)
        pick = Math.floor(Math.random() * total)
      loadIndex(pick)
      return
    }

    if (state.value.index + 1 < total) {
      loadIndex(state.value.index + 1)
      return
    }

    if (state.value.repeat === 'all' || !auto) {
      loadIndex(0)
      return
    }

    // End of the list with nothing to repeat: stop cleanly.
    pause()
    state.value.position = state.value.duration
  }

  function previous(): void {
    if (state.value.position > 3 && audio) {
      seek(0)
      return
    }

    const last = state.value.history[state.value.history.length - 1]
    if (last !== undefined && last >= 0 && last < state.value.tracks.length) {
      state.value.history = state.value.history.slice(0, -1)
      loadIndex(last, { pushHistory: false })
      return
    }

    if (state.value.index > 0) {
      loadIndex(state.value.index - 1, { pushHistory: false })
      return
    }

    if (state.value.repeat === 'all' && state.value.tracks.length > 1) {
      loadIndex(state.value.tracks.length - 1, { pushHistory: false })
      return
    }

    seek(0)
  }

  function handleEnded(): void {
    if (state.value.repeat === 'one') {
      seek(0)
      void startPlayback()
      return
    }
    next(true)
  }

  /* --------------------------------------------------------------- controls */

  function seek(seconds: number): void {
    const target = Math.max(0, Math.min(seconds, state.value.duration || seconds))
    state.value.position = target
    if (audio)
      audio.currentTime = target
  }

  function setVolume(value: number): void {
    const nextVolume = Math.max(0, Math.min(1, value))
    state.value.volume = nextVolume
    if (audio)
      audio.volume = nextVolume
    if (nextVolume > 0 && state.value.muted)
      setMuted(false)
    write(STORAGE_KEYS.volume, String(nextVolume))
  }

  function setMuted(muted: boolean): void {
    state.value.muted = muted
    if (audio)
      audio.muted = muted
    write(STORAGE_KEYS.muted, muted ? '1' : '0')
  }

  function toggleMute(): void {
    setMuted(!state.value.muted)
  }

  function toggleShuffle(): void {
    state.value.shuffle = !state.value.shuffle
    write(STORAGE_KEYS.shuffle, state.value.shuffle ? '1' : '0')
  }

  function cycleRepeat(): void {
    const order: RepeatMode[] = ['off', 'all', 'one']
    const nextMode = order[(order.indexOf(state.value.repeat) + 1) % order.length]!
    state.value.repeat = nextMode
    write(STORAGE_KEYS.repeat, nextMode)
  }

  /* ------------------------------------------------------------------ queue */

  function enqueue(song: SongDTO, options: { next?: boolean } = {}): void {
    state.value.queue = options.next
      ? [song, ...state.value.queue]
      : [...state.value.queue, song]
    syncQueue()
  }

  function removeFromQueue(position: number): void {
    state.value.queue = state.value.queue.filter((_, index) => index !== position)
    syncQueue()
  }

  function moveInQueue(position: number, direction: -1 | 1): void {
    const target = position + direction
    if (target < 0 || target >= state.value.queue.length)
      return
    const queue = [...state.value.queue]
    const [item] = queue.splice(position, 1)
    queue.splice(target, 0, item!)
    state.value.queue = queue
    syncQueue()
  }

  function clearQueue(): void {
    state.value.queue = []
    syncQueue()
  }

  /** Replaces queue contents without persisting (used when hydrating). */
  function hydrateQueue(songs: SongDTO[]): void {
    state.value.queue = songs
  }

  /**
   * Tears the player down after leaving a room for good (deleted, or the
   * session expired). The queue is dropped without syncing: the room may no
   * longer exist, so there is nothing to persist to.
   */
  function forgetRoom(): void {
    stop()
    state.value.queue = []
    state.value.roomCode = null
    state.value.expanded = false
    state.value.queueOpen = false
  }

  function setRoomCode(code: string | null): void {
    if (state.value.roomCode === code)
      return
    state.value.roomCode = code
  }

  /** Drops a song everywhere (used after a deletion). */
  function forgetSong(songId: string): void {
    state.value.queue = state.value.queue.filter(song => song.id !== songId)

    const position = state.value.tracks.findIndex(track => track.id === songId)
    if (position === -1)
      return

    const wasCurrent = position === state.value.index
    state.value.tracks = state.value.tracks.filter(track => track.id !== songId)
    state.value.history = state.value.history
      .map(index => (index > position ? index - 1 : index))
      .filter(index => index < state.value.tracks.length)

    if (wasCurrent) {
      if (state.value.tracks.length === 0) {
        stop()
      }
      else {
        loadIndex(Math.min(position, state.value.tracks.length - 1), { pushHistory: false })
      }
    }
    else if (position < state.value.index) {
      state.value.index -= 1
    }
  }

  /** Reflects an edited song (title/artist/cover) everywhere it is referenced. */
  function updateSong(song: SongDTO): void {
    state.value.tracks = state.value.tracks.map(track => (track.id === song.id ? song : track))
    state.value.queue = state.value.queue.map(track => (track.id === song.id ? song : track))
  }

  function stop(): void {
    pause()
    audio?.removeAttribute('src')
    audio?.load()
    state.value.index = -1
    state.value.tracks = []
    state.value.history = []
    state.value.position = 0
    state.value.duration = 0
    state.value.error = null
    updateMediaSession(null)
  }

  function isPlaying(songId: string): boolean {
    return current.value?.id === songId && state.value.playing
  }

  function isCurrent(songId: string): boolean {
    return current.value?.id === songId
  }

  /* -------------------------------------------------------- queue persisting */

  function syncQueue(): void {
    const code = state.value.roomCode
    if (!code)
      return
    if (syncTimer)
      clearTimeout(syncTimer)
    syncTimer = setTimeout(() => {
      syncTimer = null
      api
        .put(`/api/rooms/${code}/queue`, { songIds: state.value.queue.map(song => song.id) })
        .catch(() => {
          // A lost queue write is not worth interrupting playback for.
        })
    }, 600)
  }

  return {
    state,
    current,
    hasTrack,
    progress,
    attach,
    detach,
    playContext,
    playSong,
    toggle,
    pause,
    stop,
    next,
    previous,
    seek,
    setVolume,
    setMuted,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    enqueue,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    hydrateQueue,
    setRoomCode,
    forgetRoom,
    forgetSong,
    updateSong,
    isPlaying,
    isCurrent,
    handleEnded,
    syncQueue,
  }
}

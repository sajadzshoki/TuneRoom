import type { MaybeRefOrGetter } from 'vue'
import type { PresenceDTO, RoomDTO, RoomStateDTO, SongDTO } from '#shared/types'

/**
 * Page-level loader for a room: fetches the state (on the server when possible,
 * so the first paint already shows the library), keeps presence alive with a
 * heartbeat, and exposes `join` / `refresh`.
 */
export function useRoomData(roomRef: MaybeRefOrGetter<string>) {
  const { session, hydrate, setFailure, setLoading, setMembers, applySongs } = useRoom()
  const identity = useIdentity()
  const api = useApi()

  const code = computed(() => toValue(roomRef))

  /**
   * Captured in setup scope: the async-data handler runs later, outside the
   * Nuxt context, where `useRequestEvent()` would return nothing.
   */
  const requestEvent = useRequestEvent()

  /**
   * Public room card shown on the join screen — the only part of a room a
   * visitor who has not joined is allowed to see. Loaded inside the state
   * handler so the server renders the join screen with the real room name
   * instead of a placeholder that swaps in after hydration.
   */
  const preview = ref<RoomDTO | null>(null)

  async function loadPreview(value: string): Promise<void> {
    try {
      const result = await api.get<{ room: RoomDTO }>(
        `/api/rooms/${encodeURIComponent(value)}`,
      )
      preview.value = result.room
    }
    catch (failure) {
      // A room whose public card is gone is a room that no longer exists.
      if (parseApiError(failure).status === 404)
        session.value.missing = true
    }
  }

  /**
   * The room payload is applied *inside* the handler rather than in a watcher:
   * during SSR Vue only runs a watcher's `immediate` callback, so a watcher
   * would never see the resolved data and the server would render a skeleton
   * for a room it had already fetched (and disagree with the client).
   *
   * Not awaited on purpose — every composable below must run in the caller's
   * setup scope, and Nuxt still waits for the payload before finishing SSR.
   */
  const { refresh: refreshState } = useAsyncData(
    () => `room-state:${code.value}`,
    async (): Promise<RoomStateDTO | null> => {
      setLoading(true)
      preview.value = null
      try {
        const payload = await api.get<RoomStateDTO>(
          `/api/rooms/${encodeURIComponent(code.value)}/state`,
        )
        hydrate(code.value, payload)
        return payload
      }
      catch (failure) {
        setFailure(parseApiError(failure), code.value)
        if (session.value.needsJoin)
          await loadPreview(code.value)

        // A room that is gone must answer 404, not 200, so crawlers and link
        // previews agree with the "This room is gone" panel being rendered.
        if (session.value.missing && requestEvent)
          setResponseStatus(requestEvent, 404)
        return null
      }
    },
    { server: true, default: () => null, watch: [code] },
  )

  /* ------------------------------------------------------------- presence */

  let heartbeat: ReturnType<typeof setInterval> | null = null
  /** Songs other people add show up without a manual refresh. */
  let libraryTimer: ReturnType<typeof setInterval> | null = null

  async function beat(): Promise<void> {
    const room = session.value.room
    if (!room || !identity.guest.value)
      return
    if (import.meta.client && document.visibilityState === 'hidden')
      return

    try {
      const presence = await api.post<PresenceDTO>(`/api/rooms/${room.code}/presence`, {})
      setMembers(presence.members)
    }
    catch {
      // Presence is best effort — a dropped heartbeat must never surface an error.
    }
  }

  function startPresence(): void {
    if (!import.meta.client || heartbeat)
      return
    void beat()
    heartbeat = setInterval(beat, 20_000)
    document.addEventListener('visibilitychange', onVisibility)
  }

  function stopPresence(): void {
    if (heartbeat) {
      clearInterval(heartbeat)
      heartbeat = null
    }
    if (import.meta.client)
      document.removeEventListener('visibilitychange', onVisibility)
  }

  function onVisibility(): void {
    if (document.visibilityState !== 'visible')
      return
    void beat()
    void pollLibrary()
  }

  async function pollLibrary(): Promise<void> {
    const room = session.value.room
    if (!room || !identity.guest.value)
      return
    if (import.meta.client && document.visibilityState === 'hidden')
      return

    try {
      const result = await api.get<{ songs: SongDTO[] }>(
        `/api/rooms/${encodeURIComponent(room.code)}/songs`,
      )
      applySongs(result.songs)
    }
    catch {
      // A missed poll is invisible: the next one catches up.
    }
  }

  function startLibraryPoll(): void {
    if (!import.meta.client || libraryTimer)
      return
    libraryTimer = setInterval(() => void pollLibrary(), 30_000)
  }

  function stopLibraryPoll(): void {
    if (libraryTimer) {
      clearInterval(libraryTimer)
      libraryTimer = null
    }
  }

  watch(
    () => session.value.room !== null,
    (ready) => {
      if (ready) {
        startPresence()
        startLibraryPoll()
      }
      else {
        stopPresence()
        stopLibraryPoll()
      }
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    stopPresence()
    stopLibraryPoll()
  })

  /* -------------------------------------------------------------- actions */

  /** Joins the room and reloads the library. */
  async function join(): Promise<void> {
    await api.post(`/api/rooms/${encodeURIComponent(code.value)}/members`, {})
    await refreshState()
    startPresence()
  }

  async function refresh(): Promise<void> {
    await refreshState()
  }

  return { session, preview, join, refresh, beat, refreshLibrary: pollLibrary }
}

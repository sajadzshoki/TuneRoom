import type { GuestDTO } from '#shared/types'

/**
 * Anonymous identity.
 *
 * The source of truth is the signed httpOnly cookie, resolved once on the
 * server during SSR (see `app/plugins/identity.ts`) so the first paint already
 * knows who you are — no flash of "who are you?" for returning visitors and no
 * hydration mismatch.
 */
export interface IdentityState {
  guest: GuestDTO | null
  /** `loading` only during the very first resolution. */
  status: 'loading' | 'ready'
  error: string | null
}

export function useIdentity() {
  const state = useState<IdentityState>('identity', () => ({
    guest: null,
    status: 'loading',
    error: null,
  }))

  const api = useApi()

  const guest = computed(() => state.value.guest)
  const hasIdentity = computed(() => state.value.guest !== null)
  const isReady = computed(() => state.value.status === 'ready')

  /** Creates an identity and stores the signed cookie. */
  async function create(name: string, avatar: string): Promise<GuestDTO> {
    const { guest: created } = await api.post<{ guest: GuestDTO }>('/api/guests', { name, avatar })
    state.value = { guest: created, status: 'ready', error: null }
    return created
  }

  /** Updates name and/or avatar. */
  async function update(patch: { name?: string, avatar?: string }): Promise<GuestDTO> {
    const { guest: updated } = await api.patch<{ guest: GuestDTO }>('/api/guests/me', patch)
    state.value = { ...state.value, guest: updated, error: null }
    return updated
  }

  /** Re-reads the cookie (used after joining a room in another tab). */
  async function refresh(): Promise<void> {
    try {
      const { guest: current } = await api.get<{ guest: GuestDTO | null }>('/api/guests/me')
      state.value = { guest: current, status: 'ready', error: null }
    }
    catch (error) {
      state.value = { ...state.value, status: 'ready', error: (error as { message?: string }).message ?? null }
    }
  }

  function setGuest(next: GuestDTO | null): void {
    state.value = { guest: next, status: 'ready', error: null }
  }

  return { state, guest, hasIdentity, isReady, create, update, refresh, setGuest }
}

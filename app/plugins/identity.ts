import type { GuestDTO } from '#shared/types'

/**
 * Resolves the guest identity before the app renders.
 *
 * Runs on the server during SSR (cookies are forwarded) and again on the client
 * for a hard refresh without SSR. Either way the first render already knows who
 * the visitor is.
 */
export default defineNuxtPlugin(async () => {
  // Forwards the identity cookie when this runs during SSR.
  const request = useRequestFetch()
  const state = useState('identity', () => ({
    guest: null as GuestDTO | null,
    status: 'loading' as 'loading' | 'ready',
    error: null as string | null,
  }))

  await useAsyncData(
    'identity:me',
    async () => {
      try {
        const response = await request<{ guest: GuestDTO | null }>('/api/guests/me', {
          credentials: 'include',
        })
        state.value = { guest: response.guest, status: 'ready', error: null }
        return response.guest
      }
      catch {
        // An unreachable API must not block the landing page.
        state.value = { guest: null, status: 'ready', error: null }
        return null
      }
    },
    { server: true, default: () => null },
  )
})

import type { ApiFailure } from '~/utils/api'

/**
 * Thin wrapper around `$fetch` that turns every failure into an `ApiFailure`
 * and can surface it as a toast. Keeps error handling identical everywhere.
 */
export function useApi() {
  const toast = useToast()
  /**
   * `useRequestFetch` behaves like `$fetch` in the browser, but during SSR it
   * forwards the incoming request headers — including the identity cookie.
   * Without it every server-side API call would look anonymous.
   */
  const fetcher = useRequestFetch()

  async function request<T>(url: string, options: Record<string, unknown> = {}): Promise<T> {
    try {
      // `method` is only known at runtime here, so the response type widens;
      // call sites pin it with the generic.
      return await fetcher<T>(url, { credentials: 'include', ...options }) as T
    }
    catch (error) {
      throw parseApiError(error)
    }
  }

  const api = {
    get: <T>(url: string, options?: Record<string, unknown>) =>
      request<T>(url, { ...options, method: 'GET' }),
    post: <T>(url: string, body?: unknown, options?: Record<string, unknown>) =>
      request<T>(url, { ...options, method: 'POST', body }),
    put: <T>(url: string, body?: unknown, options?: Record<string, unknown>) =>
      request<T>(url, { ...options, method: 'PUT', body }),
    patch: <T>(url: string, body?: unknown, options?: Record<string, unknown>) =>
      request<T>(url, { ...options, method: 'PATCH', body }),
    delete: <T>(url: string, options?: Record<string, unknown>) =>
      request<T>(url, { ...options, method: 'DELETE' }),
  }

  /** Shows the failure as a toast and returns it, so callers can branch. */
  function notify(error: unknown, fallback?: string): ApiFailure {
    const failure = isApiFailure(error) ? error : parseApiError(error)
    toast.add({
      color: 'error',
      title: fallback ?? failure.message,
      icon: 'i-lucide-triangle-alert',
      duration: 5000,
    })
    return failure
  }

  function success(title: string, description?: string): void {
    toast.add({ color: 'success', title, description, icon: 'i-lucide-check', duration: 2600 })
  }

  return { ...api, request, notify, success, toast }
}

import type { ApiErrorBody } from '#shared/types'

/**
 * Client-side view of an API failure.
 *
 * The server always answers with `{ code, message, details? }`; this normalises
 * every possible shape (including network failures) into one type so the UI can
 * show a real message instead of "Error".
 */
export interface ApiFailure {
  status: number
  code: string
  message: string
  details?: Record<string, unknown>
  fields?: Record<string, string>
}

export function isApiFailure(value: unknown): value is ApiFailure {
  return typeof value === 'object'
    && value !== null
    && 'code' in value
    && 'message' in value
    && 'status' in value
}

export function fallbackMessage(status: number): string {
  switch (status) {
    case 0:
      return 'Cannot reach TuneRoom. Check your connection and try again.'
    case 401:
      return 'Please tell us your name first.'
    case 403:
      return 'You do not have access to that.'
    case 404:
      return 'We could not find that.'
    case 413:
      return 'That file is too large.'
    case 415:
      return 'That file type is not supported.'
    case 416:
      return 'That part of the file is not available.'
    case 429:
      return 'Too many requests. Give it a minute and try again.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

export function parseApiError(error: unknown): ApiFailure {
  const candidate = error as {
    statusCode?: number
    status?: number
    statusMessage?: string
    message?: string
    data?: unknown
  } | null

  const status = Number(candidate?.statusCode ?? candidate?.status ?? 0) || 0
  const payload = candidate?.data as (ApiErrorBody & { data?: ApiErrorBody }) | undefined
  const body = payload && typeof payload === 'object' && payload.code
    ? payload
    : payload?.data

  const fields = body?.details?.fields
  return {
    status,
    code: body?.code ?? candidate?.statusMessage ?? (status === 0 ? 'NETWORK_ERROR' : 'ERROR'),
    message: body?.message || candidate?.message || fallbackMessage(status),
    details: body?.details,
    fields: fields && typeof fields === 'object' ? fields as Record<string, string> : undefined,
  }
}

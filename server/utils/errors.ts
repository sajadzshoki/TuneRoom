import { createError } from 'h3'
import type { H3Error } from 'h3'
import type { ApiErrorBody } from '#shared/types'

/**
 * Every API failure is expressed as a stable machine code plus a message that
 * is safe to render in the UI. The global error handler
 * (`server/errorHandler.ts`) serialises them into `ApiErrorBody`.
 */
export const ErrorCode = {
  VALIDATION: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  SONG_NOT_FOUND: 'SONG_NOT_FOUND',
  NOT_A_MEMBER: 'NOT_A_MEMBER',
  UNSUPPORTED_FILE: 'UNSUPPORTED_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_AUDIO: 'INVALID_AUDIO',
  INVALID_URL: 'INVALID_URL',
  URL_UNREACHABLE: 'URL_UNREACHABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  STORAGE_ERROR: 'STORAGE_ERROR',
  INTERNAL: 'INTERNAL_ERROR',
} as const

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]

/** Builds an H3 error carrying the TuneRoom envelope in `data`. */
export function apiError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): H3Error {
  const body: ApiErrorBody = { code, message, ...(details ? { details } : {}) }
  return createError({
    statusCode: status,
    statusMessage: code,
    message,
    data: body,
    fatal: status >= 500,
  })
}

export function throwApi(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw apiError(status, code, message, details)
}

/* Convenience constructors for the cases used across the API. */

export function badRequest(message: string, details?: Record<string, unknown>): never {
  throwApi(400, ErrorCode.VALIDATION, message, details)
}

export function validationError(details: Record<string, string>): never {
  const first = Object.values(details)[0] ?? 'The request is not valid.'
  throwApi(422, ErrorCode.VALIDATION, first, { fields: details })
}

export function unauthenticated(message = 'Please tell us your name first.'): never {
  throwApi(401, ErrorCode.UNAUTHENTICATED, message)
}

export function forbidden(message = 'You are not allowed to do that.'): never {
  throwApi(403, ErrorCode.FORBIDDEN, message)
}

export function roomNotFound(): never {
  throwApi(404, ErrorCode.ROOM_NOT_FOUND, 'We could not find that room. Check the code and try again.')
}

export function songNotFound(): never {
  throwApi(404, ErrorCode.SONG_NOT_FOUND, 'That song is no longer in this room.')
}

export function notAMember(): never {
  throwApi(403, ErrorCode.NOT_A_MEMBER, 'Join the room to do that.')
}

export function unsupportedFile(message = 'That file type is not supported.'): never {
  throwApi(415, ErrorCode.UNSUPPORTED_FILE, message)
}

export function fileTooLarge(maxBytes: number): never {
  throwApi(413, ErrorCode.FILE_TOO_LARGE, `That file is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`)
}

export function invalidAudio(message = 'We could not read that file as audio.'): never {
  throwApi(422, ErrorCode.INVALID_AUDIO, message)
}

export function rateLimited(retryAfterSeconds: number): never {
  throwApi(429, ErrorCode.RATE_LIMITED, 'Too many requests. Give it a minute and try again.', {
    retryAfterSeconds,
  })
}

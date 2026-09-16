import type { H3Error, H3Event } from 'h3'
import { send, setResponseHeader, setResponseStatus } from 'h3'
import type { ApiErrorBody } from '#shared/types'

/**
 * Single JSON envelope for every API failure:
 *
 *     { "code": "ROOM_NOT_FOUND", "message": "…", "details": { … } }
 *
 * Unexpected errors are logged server side and reported with a generic message,
 * so internals (stack traces, SQL, file paths) never reach a client.
 * Non-API requests fall through to Nitro's default HTML error page.
 */
interface ErrorHandlerOptions {
  defaultHandler?: (error: unknown, event: H3Event) => unknown
}

/** True when the caller expects JSON rather than an HTML error page. */
function wantsJson(event: H3Event): boolean {
  const headers = event.node.req.headers
  const accept = String(headers.accept ?? '')
  const contentType = String(headers['content-type'] ?? '')
  return accept.includes('application/json') || contentType.includes('application/json')
}

export default async function tuneroomErrorHandler(
  error: unknown,
  event: H3Event,
  options?: ErrorHandlerOptions,
): Promise<unknown> {
  const isApiRequest = event.path.startsWith('/api/') || wantsJson(event)
  if (!isApiRequest)
    return options?.defaultHandler?.(error, event)

  const h3Error = error as H3Error
  const rawStatus = Number(h3Error?.statusCode) || 500
  const status = rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500

  let body: ApiErrorBody
  const data = h3Error?.data as Partial<ApiErrorBody> | undefined

  if (status >= 500) {
    console.error(`[tuneroom] ${event.method} ${event.path} failed`, error)
    body = {
      code: data?.code ?? 'INTERNAL_ERROR',
      message: data?.message ?? 'Something went wrong on our side. Please try again.',
    }
  }
  else {
    body = {
      code: data?.code ?? h3Error?.statusMessage ?? 'ERROR',
      message: data?.message || h3Error?.message || 'The request could not be completed.',
      ...(data?.details ? { details: data.details } : {}),
    }
  }

  if (status === 429 && typeof data?.details?.retryAfterSeconds === 'number')
    setResponseHeader(event, 'retry-after', String(data.details.retryAfterSeconds))

  setResponseHeader(event, 'x-content-type-options', 'nosniff')
  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseStatus(event, status)
  setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')

  // `send` ends the response, which is how h3 marks the event as handled.
  return send(event, JSON.stringify(body))
}

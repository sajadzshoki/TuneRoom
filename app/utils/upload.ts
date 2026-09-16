import type { ApiFailure } from '~/utils/api'

/**
 * Upload helper with real progress.
 *
 * `fetch` cannot report upload progress, so multipart uploads go through XHR.
 * Everything else in the app uses `$fetch`.
 */
export interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void
  signal?: AbortSignal
}

export function uploadFile<T>(url: string, body: FormData, options: UploadOptions = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.withCredentials = true

    const onAbort = () => xhr.abort()
    options.signal?.addEventListener('abort', onAbort, { once: true })

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable)
        return
      options.onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent: Math.min(100, Math.round((event.loaded / event.total) * 100)),
      })
    })

    xhr.addEventListener('load', () => {
      options.signal?.removeEventListener('abort', onAbort)
      let payload: unknown
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null
      }
      catch {
        payload = null
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload as T)
        return
      }

      reject(parseApiError({ statusCode: xhr.status, data: payload } as never))
    })

    xhr.addEventListener('error', () => {
      options.signal?.removeEventListener('abort', onAbort)
      reject(parseApiError({ statusCode: 0 } as never) satisfies ApiFailure)
    })

    xhr.addEventListener('abort', () => {
      options.signal?.removeEventListener('abort', onAbort)
      reject({
        status: 0,
        code: 'ABORTED',
        message: 'Upload cancelled.',
      } satisfies ApiFailure)
    })

    xhr.send(body)
  })
}

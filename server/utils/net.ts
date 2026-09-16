import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * SSRF guard for "add from URL".
 *
 * TuneRoom only fetches plain public web URLs. Anything that resolves to a
 * private, loopback, link-local or reserved address is refused before a single
 * byte is requested, so the server can never be pointed at cloud metadata
 * endpoints or the local network.
 *
 * Known limitation (documented in PROJECT.md): a hostile DNS server could
 * rebind a hostname between this check and the fetch. Pinning the resolved
 * address is left for the S3/CDN deployment path.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
])

export async function assertSafeRemoteUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw.trim())
  }
  catch {
    invalidUrl('Enter a complete link, including https://')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    invalidUrl('Only http and https links are supported.')

  if (url.username || url.password)
    invalidUrl('Links with embedded credentials are not allowed.')

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!hostname)
    invalidUrl('That link has no host.')

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal'))
    invalidUrl('That address is not reachable from the server.')

  if (url.port && url.port !== '80' && url.port !== '443')
    invalidUrl('Only standard web ports (80 and 443) are allowed.')

  let addresses: string[]
  if (isIP(hostname)) {
    addresses = [hostname]
  }
  else {
    try {
      addresses = (await lookup(hostname, { all: true, verbatim: true })).map(entry => entry.address)
    }
    catch {
      throwApi(422, ErrorCode.URL_UNREACHABLE, 'We could not resolve that host. Is the link correct?')
    }
  }

  if (!addresses.length)
    throwApi(422, ErrorCode.URL_UNREACHABLE, 'We could not resolve that host.')

  for (const address of addresses) {
    if (isBlockedAddress(address))
      invalidUrl('That address points at a private network, so it cannot be added.')
  }

  return url
}

export function invalidUrl(message: string): never {
  throwApi(422, ErrorCode.INVALID_URL, message)
}

/** True for loopback, private, link-local, multicast and reserved addresses. */
export function isBlockedAddress(address: string): boolean {
  if (address.includes(':'))
    return isBlockedIpv6(address)
  return isBlockedIpv4(address)
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255))
    return true

  const [a, b] = parts as [number, number, number, number]

  if (a === 0 || a === 10 || a === 127)
    return true
  if (a === 100 && b >= 64 && b <= 127)
    return true // CGNAT
  if (a === 169 && b === 254)
    return true // link local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31)
    return true
  if (a === 192 && b === 0)
    return true
  if (a === 192 && b === 168)
    return true
  if (a === 198 && (b === 18 || b === 19 || b === 51))
    return true
  if (a === 203 && b === 0)
    return true
  if (a >= 224)
    return true // multicast + reserved
  return false
}

function isBlockedIpv6(address: string): boolean {
  const value = address.toLowerCase()

  if (value === '::' || value === '::1')
    return true
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb'))
    return true // link local
  if (value.startsWith('fc') || value.startsWith('fd'))
    return true // unique local
  if (value.startsWith('ff'))
    return true // multicast
  if (value.startsWith('2001:db8'))
    return true // documentation
  if (value.startsWith('100::'))
    return true // discard-only

  // IPv4-mapped (::ffff:127.0.0.1) and IPv4-compatible addresses.
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped?.[1])
    return isBlockedIpv4(mapped[1])
  if (value.startsWith('::') && /\d+\.\d+\.\d+\.\d+$/.test(value))
    return isBlockedIpv4(value.split(':').pop() as string)

  return false
}

/**
 * Fetches a remote audio file with hard limits:
 *
 *  - at most 3 redirects, and every hop is re-validated (redirects are the
 *    easiest way to smuggle a request into a private network);
 *  - a wall-clock timeout;
 *  - streaming with an early abort once the size cap is exceeded, so a hostile
 *    server cannot exhaust memory.
 */
export interface RemoteAudio {
  buffer: Buffer
  contentType: string
  finalUrl: URL
}

const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 30_000

export async function fetchRemoteAudio(target: URL, maxBytes: number): Promise<RemoteAudio> {
  let current = target

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'user-agent': 'TuneRoom/0.1 (shared music rooms)',
          accept: 'audio/*, application/octet-stream;q=0.8, */*;q=0.5',
        },
      })
    }
    catch (error) {
      const message = (error as Error)?.name === 'TimeoutError'
        ? 'That link took too long to respond.'
        : 'We could not reach that link.'
      throwApi(422, ErrorCode.URL_UNREACHABLE, message)
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location)
        throwApi(422, ErrorCode.URL_UNREACHABLE, 'That link redirected without a destination.')

      let next: URL
      try {
        next = new URL(location, current)
      }
      catch {
        invalidUrl('That link redirected to an invalid address.')
      }
      await assertSafeRemoteUrl(next.href)
      current = next
      continue
    }

    if (!response.ok) {
      throwApi(
        422,
        ErrorCode.URL_UNREACHABLE,
        `That link responded with ${response.status}. Is it still available?`,
      )
    }

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
    const declaredLength = Number(response.headers.get('content-length') ?? 0)
    if (declaredLength > maxBytes)
      fileTooLarge(maxBytes)

    const buffer = await readBodyWithCap(response, maxBytes)
    return { buffer, contentType, finalUrl: current }
  }

  throwApi(422, ErrorCode.URL_UNREACHABLE, 'That link redirected too many times.')
}

async function readBodyWithCap(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body)
    return Buffer.alloc(0)

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done)
        break
      if (!value)
        continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        fileTooLarge(maxBytes)
      }
      chunks.push(value)
    }
  }
  finally {
    reader.releaseLock()
  }

  return Buffer.concat(chunks, total)
}

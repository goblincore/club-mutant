/**
 * Monkey-patch globalThis.fetch with a raw-socket HTTP client.
 *
 * Why: The Colyseus server uses @colyseus/uwebsockets-transport which sends
 * duplicate Content-Length headers (one lowercase from Colyseus controller,
 * one mixed-case from uWebSockets itself). Node.js 22's native fetch (undici)
 * strictly rejects duplicate Content-Length per HTTP spec. curl and browsers
 * tolerate it, but Node.js does not.
 *
 * This module replaces globalThis.fetch with a minimal implementation built on
 * raw net.Socket (plain TCP) or tls.connect (TLS) to bypass all HTTP parsers
 * entirely. Only supports the subset of fetch that @colyseus/sdk needs
 * (POST with JSON body, GET).
 *
 * Also strips credentials:'include' that the SDK hardcodes.
 *
 * MUST be imported before @colyseus/sdk in every scenario file.
 */
import net from 'node:net'
import tls from 'node:tls'

interface RawResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
}

function rawHttpRequest(
  method: string,
  urlStr: string,
  body?: string,
  reqHeaders?: Record<string, string>,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const isSecure = url.protocol === 'https:'
    const host = url.hostname
    const port = parseInt(url.port || (isSecure ? '443' : '80'))
    const path = url.pathname + url.search

    const headerLines: string[] = [
      `${method} ${path} HTTP/1.1`,
      `Host: ${host}`,
    ]

    // Add request headers
    if (reqHeaders) {
      for (const [k, v] of Object.entries(reqHeaders)) {
        // Skip host (already added) and content-length (added below)
        const lower = k.toLowerCase()
        if (lower === 'host' || lower === 'content-length') continue
        headerLines.push(`${k}: ${v}`)
      }
    }

    if (body) {
      headerLines.push(`Content-Length: ${Buffer.byteLength(body)}`)
    }

    headerLines.push('Connection: close')
    headerLines.push('')
    headerLines.push(body || '')

    const requestData = headerLines.join('\r\n')

    // Use TLS for https://, plain TCP for http://
    const socket = isSecure
      ? tls.connect(port, host, { servername: host }, () => {
          socket.write(requestData)
        })
      : net.connect(port, host, () => {
          socket.write(requestData)
        })

    const chunks: Buffer[] = []
    socket.on('data', (chunk: Buffer) => chunks.push(chunk))
    socket.on('end', () => {
      const data = Buffer.concat(chunks).toString()
      const idx = data.indexOf('\r\n\r\n')
      if (idx === -1) return reject(new Error('Malformed HTTP response'))

      const headerPart = data.substring(0, idx)
      let bodyPart = data.substring(idx + 4)

      const lines = headerPart.split('\r\n')
      const statusLine = lines[0]
      const statusCode = parseInt(statusLine.split(' ')[1])

      const headers: Record<string, string> = {}
      for (let i = 1; i < lines.length; i++) {
        const colon = lines[i].indexOf(':')
        if (colon > 0) {
          const key = lines[i].substring(0, colon).trim().toLowerCase()
          const value = lines[i].substring(colon + 1).trim()
          // For duplicate headers, keep last value (matches browser behavior)
          headers[key] = value
        }
      }

      // Handle chunked transfer encoding
      if (headers['transfer-encoding']?.includes('chunked')) {
        bodyPart = decodeChunked(bodyPart)
      }

      resolve({ statusCode, headers, body: bodyPart })
    })
    socket.on('error', reject)
    socket.setTimeout(10000, () => {
      socket.destroy()
      reject(new Error('Socket timeout'))
    })
  })
}

function decodeChunked(raw: string): string {
  let result = ''
  let pos = 0
  while (pos < raw.length) {
    const lineEnd = raw.indexOf('\r\n', pos)
    if (lineEnd === -1) break
    const sizeHex = raw.substring(pos, lineEnd).trim()
    const size = parseInt(sizeHex, 16)
    if (size === 0) break
    pos = lineEnd + 2
    result += raw.substring(pos, pos + size)
    pos += size + 2 // skip chunk data + \r\n
  }
  return result
}

// Replace globalThis.fetch with our raw-socket implementation
globalThis.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const method = init?.method || 'GET'

  // Build headers from init
  const reqHeaders: Record<string, string> = {}
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        reqHeaders[k] = v
      })
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) {
        reqHeaders[k] = v
      }
    } else {
      Object.assign(reqHeaders, init.headers)
    }
  }

  let body: string | undefined
  if (init?.body) {
    body = typeof init.body === 'string' ? init.body : init.body.toString()
  }

  const raw = await rawHttpRequest(method, url, body, reqHeaders)

  // Build a proper Response object
  return new Response(raw.body, {
    status: raw.statusCode,
    headers: raw.headers,
  })
} as typeof fetch

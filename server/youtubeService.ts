import type { Response } from 'express'
import type { IncomingMessage } from 'http'

const YOUTUBE_SERVICE_URL = process.env.YOUTUBE_SERVICE_URL || 'http://localhost:8081'
const SERVICE_TIMEOUT_MS = 5000
const RESOLVE_TIMEOUT_MS = 60000

// In-memory cache for resolved URLs
interface CachedResolve {
  response: ResolveResponse
  expiresAt: number
}

const resolveCache = new Map<string, CachedResolve>()

// In-flight request tracking for request coalescing
const inFlightResolves = new Map<string, Promise<ResolveResponse>>()

interface VideoResult {
  id: string
  type: string
  title: string
  channelTitle: string
  duration: string
  isLive: boolean
  thumbnail: string
}

interface SearchResponse {
  items: VideoResult[]
  query: string
  cached: boolean
  cacheAt?: number
}

interface LegacyVideoResult {
  id: string
  type: string
  title: string
  channelTitle: string
  thumbnail: { thumbnails: { url: string }[] }
  length: { simpleText?: string } | string
  isLive: boolean
  shortBylineText?: string
}

interface LegacySearchResponse {
  items: LegacyVideoResult[]
  nextPage?: unknown
}

function transformGoResponseToLegacy(response: SearchResponse): LegacySearchResponse {
  return {
    items: response.items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      channelTitle: item.channelTitle,
      thumbnail: {
        thumbnails: [{ url: item.thumbnail }],
      },
      length: { simpleText: item.duration },
      isLive: item.isLive,
      shortBylineText: item.channelTitle,
    })),
  }
}

export async function searchYouTube(query: string, limit = 24): Promise<LegacySearchResponse> {
  const url = `${YOUTUBE_SERVICE_URL}/search?q=${encodeURIComponent(query)}&limit=${limit}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SERVICE_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: controller.signal })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`YouTube service error: ${response.status}`)
    }

    const data: SearchResponse = await response.json()

    console.log(
      `[youtubeService] Search "${query}" returned ${data.items.length} results (cached: ${data.cached})`
    )

    return transformGoResponseToLegacy(data)
  } catch (e) {
    clearTimeout(timeoutId)

    if (e instanceof Error && e.name === 'AbortError') {
      console.warn(`[youtubeService] Request timed out after ${SERVICE_TIMEOUT_MS}ms`)
    } else {
      console.warn(`[youtubeService] Failed to reach Go service:`, e)
    }

    throw e
  }
}

export async function isServiceHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`${YOUTUBE_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    })

    return response.ok
  } catch {
    return false
  }
}

export interface ResolveResponse {
  videoId: string
  url: string
  expiresAtMs: number | null
  resolvedAtMs: number
  videoOnly?: boolean
  quality?: string
}

export async function resolveYouTubeVideo(
  videoId: string,
  videoOnly = false
): Promise<ResolveResponse> {
  const cacheKey = `${videoId}:${videoOnly}`

  // Check cache first
  const cached = resolveCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`[youtubeService] Cache hit for ${videoId}`)
    return cached.response
  }

  // Check if there's already an in-flight request for this video
  const inFlight = inFlightResolves.get(cacheKey)
  if (inFlight) {
    console.log(`[youtubeService] Coalescing request for ${videoId}`)
    return inFlight
  }

  // Create the actual request promise
  const requestPromise = (async (): Promise<ResolveResponse> => {
    const params = videoOnly ? '?videoOnly=true' : ''
    const url = `${YOUTUBE_SERVICE_URL}/resolve/${videoId}${params}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS)

    try {
      const response = await fetch(url, { signal: controller.signal })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`YouTube service resolve error: ${response.status}`)
      }

      const data: ResolveResponse = await response.json()

      console.log(`[youtubeService] Resolved ${videoId} -> ${data.quality ?? 'unknown'}`)

      // Cache the response - expire 1 minute before the actual URL expires
      const expiresAt = data.expiresAtMs ? data.expiresAtMs - 60_000 : Date.now() + 5 * 60 * 1000
      resolveCache.set(cacheKey, { response: data, expiresAt })

      return data
    } catch (e) {
      clearTimeout(timeoutId)

      if (e instanceof Error && e.name === 'AbortError') {
        console.warn(`[youtubeService] Resolve timed out after ${RESOLVE_TIMEOUT_MS}ms`)
      } else {
        console.warn(`[youtubeService] Resolve failed:`, e)
      }

      throw e
    } finally {
      // Remove from in-flight map when done
      inFlightResolves.delete(cacheKey)
    }
  })()

  // Track in-flight request
  inFlightResolves.set(cacheKey, requestPromise)

  return requestPromise
}

export async function proxyYouTubeVideo(
  videoId: string,
  rangeHeader: string | undefined,
  res: Response
): Promise<void> {
  const url = `${YOUTUBE_SERVICE_URL}/proxy/${videoId}`

  const headers: Record<string, string> = {}
  if (rangeHeader) {
    headers['Range'] = rangeHeader
  }

  const upstream = await fetch(url, { headers })

  if (!upstream.ok && upstream.status !== 206) {
    throw new Error(`YouTube service proxy error: ${upstream.status}`)
  }

  res.status(upstream.status)

  const passthroughHeaders = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
  ] as const

  for (const header of passthroughHeaders) {
    const value = upstream.headers.get(header)
    if (value) {
      res.setHeader(header, value)
    }
  }

  if (!upstream.body) {
    throw new Error('No response body from proxy')
  }

  const reader = upstream.body.getReader()

  const stream = async (): Promise<void> => {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        res.end()
        return
      }

      const canContinue = res.write(value)

      if (!canContinue) {
        await new Promise<void>((resolve) => res.once('drain', resolve))
      }
    }
  }

  try {
    await stream()
  } catch (e) {
    reader.cancel()
    throw e
  }
}

const YOUTUBE_SERVICE_URL = process.env.YOUTUBE_SERVICE_URL || 'http://localhost:8081'
const SERVICE_TIMEOUT_MS = 5000

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

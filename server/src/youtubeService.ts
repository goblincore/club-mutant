// YouTube service client for server-initiated operations.
// Client-3d now calls the Go YouTube service (yt.mutante.club) directly for
// search, resolve, and proxy. This file only handles server-side prefetch
// (used by DJ queue and jukebox commands to pre-warm the video cache).

const YOUTUBE_SERVICE_URL = process.env.YOUTUBE_SERVICE_URL || 'http://localhost:8081'

// Extract video ID from YouTube link
function extractVideoId(link: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]

  for (const pattern of patterns) {
    const match = link.match(pattern)
    if (match) return match[1]
  }

  return null
}

// Trigger prefetch for a video (fire-and-forget)
export function prefetchVideo(link: string): void {
  const videoId = extractVideoId(link)
  if (!videoId) {
    console.warn(`[youtubeService] Could not extract video ID from: ${link}`)
    return
  }

  const url = `${YOUTUBE_SERVICE_URL}/prefetch/${videoId}`

  fetch(url, { method: 'POST' })
    .then((res) => {
      if (res.ok) {
        console.log(`[youtubeService] Prefetch triggered for ${videoId}`)
      } else {
        console.warn(`[youtubeService] Prefetch failed for ${videoId}: ${res.status}`)
      }
    })
    .catch((e) => {
      console.warn(`[youtubeService] Prefetch error for ${videoId}:`, e)
    })
}

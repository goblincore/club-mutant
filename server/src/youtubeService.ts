// YouTube service client for server-initiated operations.
// Client-3d now calls the Go YouTube service (yt.mutante.club) directly for
// search, resolve, and proxy. This file only handles server-side prefetch
// (used by DJ queue and jukebox commands to pre-warm the video cache).

import { parseYoutubeVideoId } from './lib/youtubeLink'

const YOUTUBE_SERVICE_URL = process.env.YOUTUBE_SERVICE_URL || 'http://localhost:8081'

const extractVideoId = parseYoutubeVideoId

// Trigger prefetch for a video (fire-and-forget).
// Use priority 'high' for next-up tracks that need to be ready ASAP.
export function prefetchVideo(link: string, priority: 'normal' | 'high' = 'normal'): void {
  const videoId = extractVideoId(link)
  if (!videoId) {
    console.warn(`[youtubeService] Could not extract video ID from: ${link}`)
    return
  }

  const params = priority === 'high' ? '?priority=high' : ''
  const url = `${YOUTUBE_SERVICE_URL}/prefetch/${videoId}${params}`

  fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }, signal: AbortSignal.timeout(5000) })
    .then((res) => {
      if (res.ok) {
        console.log(`[youtubeService] Prefetch triggered for ${videoId} (priority=${priority})`)
      } else {
        console.warn(`[youtubeService] Prefetch failed for ${videoId}: ${res.status}`)
      }
    })
    .catch((e) => {
      console.warn(`[youtubeService] Prefetch error for ${videoId}:`, e)
    })
}

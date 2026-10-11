const ID = /^[a-zA-Z0-9_-]{11}$/
const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
])

/**
 * Extract the video id from a bare id or any ordinary YouTube watch/short/embed URL.
 * Returns null for anything else so callers can reject it.
 */
export function parseYoutubeVideoId(link: unknown): string | null {
  if (typeof link !== 'string' || link.length > 256) return null
  if (ID.test(link)) return link

  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname.toLowerCase())) return null

  let candidate: string | null | undefined
  if (url.hostname.toLowerCase() === 'youtu.be') {
    candidate = url.pathname.split('/')[1]
  } else if (url.pathname === '/watch') {
    candidate = url.searchParams.get('v')
  } else {
    const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)
    candidate = match?.[1]
  }
  return candidate && ID.test(candidate) ? candidate : null
}

export const canonicalYoutubeLink = (id: string) => `https://www.youtube.com/watch?v=${id}`

/** Older saved playlists hold youtu.be / music. / m. links; store the one form downstream code understands. */
export function normalizeYoutubeLink(link: string): string {
  const id = parseYoutubeVideoId(link)
  return id ? canonicalYoutubeLink(id) : link
}

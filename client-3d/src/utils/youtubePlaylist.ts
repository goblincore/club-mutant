// YouTube playlist URL/ID parsing for the import feature.

const PLAYLIST_ID_REGEX = /^[A-Za-z0-9_-]{10,64}$/

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
])

// Mixes (RD*) and auth-required lists (Watch Later, Liked) cannot be fetched
// anonymously via InnerTube.
function isImportableId(id: string): boolean {
  if (!PLAYLIST_ID_REGEX.test(id)) return false
  if (id === 'WL' || id === 'LL') return false
  if (id.startsWith('RD')) return false
  return true
}

/**
 * Extract an importable playlist ID from user input: a bare ID or any
 * youtube.com / youtu.be / music.youtube.com URL carrying a `list=` param.
 * Returns null for mixes (RD*), Watch Later/Liked, and unrecognized input.
 */
export function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Bare playlist ID — but an 11-char string is ambiguous with video IDs.
  if (PLAYLIST_ID_REGEX.test(trimmed) && trimmed.length !== 11) {
    return isImportableId(trimmed) ? trimmed : null
  }

  let url: URL
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  if (!YOUTUBE_HOSTS.has(url.hostname)) return null

  const list = url.searchParams.get('list')
  if (!list || !isImportableId(list)) return null
  return list
}

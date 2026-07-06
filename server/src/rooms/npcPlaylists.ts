// Curated playlists for the NPC automaton DJ.
// See docs/plans/2026-07-05-npc-dj-design.md — Section 1.
//
// Playlist JSON files live in src/data/npc-playlists/ and are bundled into the
// server build via JSON imports (resolveJsonModule + tsup). Durations ship in
// the file so no YouTube lookups are needed at spawn.

import defaultPlaylistJson from '../data/npc-playlists/default.json'

export interface NpcPlaylistTrack {
  id: string
  title: string
  link: string
  duration: number
}

export interface NpcPlaylist {
  id: string
  name: string
  tracks: NpcPlaylistTrack[]
}

// Registry of shipped playlists, keyed by playlist id.
const RAW_PLAYLISTS: Record<string, unknown> = {
  default: defaultPlaylistJson,
}

// Same shapes youtubeService.extractVideoId accepts (full URL or bare 11-char id)
const YOUTUBE_LINK_PATTERNS = [
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  /^([a-zA-Z0-9_-]{11})$/,
]

function isYouTubeLink(link: string): boolean {
  return YOUTUBE_LINK_PATTERNS.some((pattern) => pattern.test(link))
}

/**
 * Load and validate an NPC playlist by id.
 * Malformed entries are warned about and skipped; returns null (refuse spawn)
 * if the playlist is unknown or has no valid tracks left after validation.
 */
export function loadNpcPlaylist(id: string): NpcPlaylist | null {
  const raw = RAW_PLAYLISTS[id]

  if (!raw || typeof raw !== 'object') {
    console.warn('[NpcPlaylists] Unknown playlist id:', id)
    return null
  }

  const playlist = raw as { id?: unknown; name?: unknown; tracks?: unknown }

  if (!Array.isArray(playlist.tracks)) {
    console.warn('[NpcPlaylists] Playlist has no tracks array:', id)
    return null
  }

  const tracks: NpcPlaylistTrack[] = []

  for (const entry of playlist.tracks) {
    const track = entry as { id?: unknown; title?: unknown; link?: unknown; duration?: unknown }

    const title = typeof track.title === 'string' ? track.title.trim() : ''
    const link = typeof track.link === 'string' ? track.link.trim() : ''
    const duration =
      typeof track.duration === 'number' && Number.isFinite(track.duration) ? track.duration : 0

    if (!title || !link || !isYouTubeLink(link) || duration <= 0) {
      console.warn('[NpcPlaylists] Skipping malformed track in playlist', id, ':', entry)
      continue
    }

    tracks.push({
      id: typeof track.id === 'string' && track.id ? track.id : link,
      title,
      link,
      duration,
    })
  }

  if (tracks.length === 0) {
    console.warn('[NpcPlaylists] Playlist empty after validation, refusing:', id)
    return null
  }

  return {
    id: typeof playlist.id === 'string' && playlist.id ? playlist.id : id,
    name: typeof playlist.name === 'string' && playlist.name ? playlist.name : id,
    tracks,
  }
}

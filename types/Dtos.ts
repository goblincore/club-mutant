export type PlaylistItemDto = {
  id: string

  djId: string

  title: string

  link: string | null

  duration: number

  visualUrl?: string | null

  trackMessage?: string | null
}

// NEW: Room Queue Playlist item for DJ rotation
export interface RoomQueuePlaylistItemDto {
  id: string
  title: string
  link: string
  duration: number
  addedAtMs: number
  played?: boolean
}

// NEW: DJ Queue Entry for tracking rotation
export interface DJQueueEntryDto {
  sessionId: string
  name: string
  joinedAtMs: number
  queuePosition: number
}

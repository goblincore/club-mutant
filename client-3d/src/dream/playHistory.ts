import { useMusicStore } from '../stores/musicStore'

const STORAGE_KEY = 'club-mutant-3d:play-history:v1'
const MAX_ENTRIES = 50

export interface PlayHistoryEntry {
  videoId: string
  playedAt: number
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function extractVideoId(link: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const pattern of patterns) {
    const match = link.match(pattern)
    if (match) return match[1]!
  }
  return null
}

/** Records what the player actually heard in the club. Feeds dream source material. */
export class PlayHistory {
  private entries: PlayHistoryEntry[]

  constructor(
    private storage: StorageLike,
    private now: () => number = Date.now
  ) {
    this.entries = this.load()
  }

  record(videoId: string): void {
    if (this.entries[0]?.videoId === videoId) return
    this.entries.unshift({ videoId, playedAt: this.now() })
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES
    this.save()
  }

  /** Video ids, most recent first, optionally limited to a max age in ms */
  recent(maxAgeMs?: number): string[] {
    const cutoff = maxAgeMs !== undefined ? this.now() - maxAgeMs : -Infinity
    return this.entries.filter((e) => e.playedAt >= cutoff).map((e) => e.videoId)
  }

  private load(): PlayHistoryEntry[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as PlayHistoryEntry[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private save(): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.entries))
    } catch {
      // storage full / unavailable — history is best-effort
    }
  }
}

let _instance: PlayHistory | null = null

export function getPlayHistory(): PlayHistory {
  if (!_instance) _instance = new PlayHistory(window.localStorage)
  return _instance
}

/** Subscribe to the music store and record every track the player hears. Returns unsubscribe. */
export function startPlayHistoryTracking(history: PlayHistory = getPlayHistory()): () => void {
  return useMusicStore.subscribe((state, prev) => {
    const link = state.stream.currentLink
    if (link && link !== prev.stream.currentLink) {
      const id = extractVideoId(link)
      if (id) history.record(id)
    }
  })
}

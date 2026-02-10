import { create } from 'zustand'

const STORAGE_KEY = 'club-mutant-3d:playlists:v1'

export interface PlaylistTrack {
  id: string
  title: string
  link: string
  duration: number
}

export interface MyPlaylist {
  id: string
  name: string
  items: PlaylistTrack[]
}

interface PlaylistState {
  playlists: MyPlaylist[]
  activePlaylistId: string | null

  createPlaylist: (name: string) => void
  removePlaylist: (id: string) => void
  renamePlaylist: (id: string, name: string) => void
  setActivePlaylist: (id: string | null) => void
  addTrack: (playlistId: string, track: PlaylistTrack) => void
  removeTrack: (playlistId: string, trackId: string) => void
}

function loadPersisted(): { playlists: MyPlaylist[]; activePlaylistId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { playlists: [], activePlaylistId: null }

    const parsed = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object') return { playlists: [], activePlaylistId: null }

    const playlists = Array.isArray(parsed.playlists) ? parsed.playlists : []
    const activePlaylistId = typeof parsed.activePlaylistId === 'string' ? parsed.activePlaylistId : null

    return { playlists, activePlaylistId }
  } catch {
    return { playlists: [], activePlaylistId: null }
  }
}

function persist(state: { playlists: MyPlaylist[]; activePlaylistId: string | null }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      playlists: state.playlists,
      activePlaylistId: state.activePlaylistId,
    }))
  } catch {
    // localStorage full or unavailable
  }
}

const initial = loadPersisted()

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlists: initial.playlists,
  activePlaylistId: initial.activePlaylistId,

  createPlaylist: (name) => {
    const id = crypto.randomUUID()

    set((s) => {
      const next = {
        playlists: [...s.playlists, { id, name, items: [] }],
        activePlaylistId: s.activePlaylistId ?? id,
      }

      persist(next)
      return next
    })
  },

  removePlaylist: (id) => {
    set((s) => {
      const next = {
        playlists: s.playlists.filter((p) => p.id !== id),
        activePlaylistId: s.activePlaylistId === id
          ? (s.playlists.find((p) => p.id !== id)?.id ?? null)
          : s.activePlaylistId,
      }

      persist(next)
      return next
    })
  },

  renamePlaylist: (id, name) => {
    set((s) => {
      const next = {
        playlists: s.playlists.map((p) => (p.id === id ? { ...p, name } : p)),
        activePlaylistId: s.activePlaylistId,
      }

      persist(next)
      return next
    })
  },

  setActivePlaylist: (id) => {
    set({ activePlaylistId: id })
    persist(get())
  },

  addTrack: (playlistId, track) => {
    set((s) => {
      const next = {
        playlists: s.playlists.map((p) =>
          p.id === playlistId ? { ...p, items: [...p.items, track] } : p
        ),
        activePlaylistId: s.activePlaylistId,
      }

      persist(next)
      return next
    })
  },

  removeTrack: (playlistId, trackId) => {
    set((s) => {
      const next = {
        playlists: s.playlists.map((p) =>
          p.id === playlistId
            ? { ...p, items: p.items.filter((t) => t.id !== trackId) }
            : p
        ),
        activePlaylistId: s.activePlaylistId,
      }

      persist(next)
      return next
    })
  },
}))

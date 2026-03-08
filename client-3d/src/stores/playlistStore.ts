import { create } from 'zustand'
import { useAuthStore } from './authStore'
import {
  listServerPlaylists,
  saveServerPlaylist,
  deleteServerPlaylist,
} from '../network/nakamaClient'

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
  syncing: boolean
  lastSyncError: string | null

  createPlaylist: (name: string) => void
  removePlaylist: (id: string) => void
  renamePlaylist: (id: string, name: string) => void
  setActivePlaylist: (id: string | null) => void
  addTrack: (playlistId: string, track: PlaylistTrack) => void
  removeTrack: (playlistId: string, trackId: string) => void
  reorderTrack: (playlistId: string, fromIndex: number, toIndex: number) => void
  loadFromServer: () => Promise<void>
}

// ── localStorage persistence (synchronous, immediate) ──────────────────────

function loadPersisted(): { playlists: MyPlaylist[]; activePlaylistId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { playlists: [], activePlaylistId: null }

    const parsed = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object') return { playlists: [], activePlaylistId: null }

    const playlists = Array.isArray(parsed.playlists) ? parsed.playlists : []
    const activePlaylistId =
      typeof parsed.activePlaylistId === 'string' ? parsed.activePlaylistId : null

    return { playlists, activePlaylistId }
  } catch {
    return { playlists: [], activePlaylistId: null }
  }
}

function persistLocal(state: { playlists: MyPlaylist[]; activePlaylistId: string | null }) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        playlists: state.playlists,
        activePlaylistId: state.activePlaylistId,
      })
    )
  } catch {
    // localStorage full or unavailable
  }
}

// ── Debounced server sync ──────────────────────────────────────────────────

const _syncTimers = new Map<string, ReturnType<typeof setTimeout>>()

function isAuthenticated(): boolean {
  return useAuthStore.getState().isAuthenticated
}

function scheduleSyncPlaylist(playlistId: string) {
  if (!isAuthenticated()) return

  const existing = _syncTimers.get(playlistId)
  if (existing) clearTimeout(existing)

  _syncTimers.set(
    playlistId,
    setTimeout(() => {
      _syncTimers.delete(playlistId)
      const playlist = usePlaylistStore.getState().playlists.find((p) => p.id === playlistId)
      if (!playlist) return
      saveServerPlaylist({ id: playlist.id, name: playlist.name, items: playlist.items }).catch(
        (err) => {
          console.warn('[playlists] Server sync failed for', playlistId, err)
          usePlaylistStore.setState({ lastSyncError: String(err) })
        }
      )
    }, 500)
  )
}

function scheduleDeletePlaylist(playlistId: string) {
  if (!isAuthenticated()) return

  // Cancel any pending save for this playlist
  const existing = _syncTimers.get(playlistId)
  if (existing) {
    clearTimeout(existing)
    _syncTimers.delete(playlistId)
  }

  deleteServerPlaylist(playlistId).catch((err) => {
    console.warn('[playlists] Server delete failed for', playlistId, err)
    usePlaylistStore.setState({ lastSyncError: String(err) })
  })
}

// ── Store ──────────────────────────────────────────────────────────────────

const initial = loadPersisted()

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlists: initial.playlists,
  activePlaylistId: initial.activePlaylistId,
  syncing: false,
  lastSyncError: null,

  createPlaylist: (name) => {
    const id = crypto.randomUUID()

    set((s) => {
      const next = {
        playlists: [...s.playlists, { id, name, items: [] }],
        activePlaylistId: s.activePlaylistId ?? id,
      }

      persistLocal(next)
      return next
    })

    scheduleSyncPlaylist(id)
  },

  removePlaylist: (id) => {
    set((s) => {
      const next = {
        playlists: s.playlists.filter((p) => p.id !== id),
        activePlaylistId:
          s.activePlaylistId === id
            ? (s.playlists.find((p) => p.id !== id)?.id ?? null)
            : s.activePlaylistId,
      }

      persistLocal(next)
      return next
    })

    scheduleDeletePlaylist(id)
  },

  renamePlaylist: (id, name) => {
    set((s) => {
      const next = {
        playlists: s.playlists.map((p) => (p.id === id ? { ...p, name } : p)),
        activePlaylistId: s.activePlaylistId,
      }

      persistLocal(next)
      return next
    })

    scheduleSyncPlaylist(id)
  },

  setActivePlaylist: (id) => {
    set({ activePlaylistId: id })
    persistLocal(get())
    // activePlaylistId is local-only, no server sync needed
  },

  addTrack: (playlistId, track) => {
    set((s) => {
      const next = {
        playlists: s.playlists.map((p) =>
          p.id === playlistId ? { ...p, items: [...p.items, track] } : p
        ),
        activePlaylistId: s.activePlaylistId,
      }

      persistLocal(next)
      return next
    })

    scheduleSyncPlaylist(playlistId)
  },

  removeTrack: (playlistId, trackId) => {
    set((s) => {
      const next = {
        playlists: s.playlists.map((p) =>
          p.id === playlistId ? { ...p, items: p.items.filter((t) => t.id !== trackId) } : p
        ),
        activePlaylistId: s.activePlaylistId,
      }

      persistLocal(next)
      return next
    })

    scheduleSyncPlaylist(playlistId)
  },

  reorderTrack: (playlistId, fromIndex, toIndex) => {
    set((s) => {
      const next = {
        playlists: s.playlists.map((p) => {
          if (p.id !== playlistId) return p

          const items = [...p.items]
          const [moved] = items.splice(fromIndex, 1)
          items.splice(toIndex, 0, moved)

          return { ...p, items }
        }),
        activePlaylistId: s.activePlaylistId,
      }

      persistLocal(next)
      return next
    })

    scheduleSyncPlaylist(playlistId)
  },

  loadFromServer: async () => {
    if (!isAuthenticated()) return

    set({ syncing: true, lastSyncError: null })

    try {
      const serverPlaylists = await listServerPlaylists()
      const localPlaylists = get().playlists

      // Build a map of server playlists by ID
      const serverMap = new Map<string, MyPlaylist>()
      for (const sp of serverPlaylists) {
        serverMap.set(sp.id, { id: sp.id, name: sp.name, items: sp.items })
      }

      // Find local-only playlists (not on server) to upload
      const localOnly: MyPlaylist[] = []
      for (const lp of localPlaylists) {
        if (!serverMap.has(lp.id)) {
          localOnly.push(lp)
        }
      }

      // Merged result: server playlists + local-only playlists
      const merged = [...serverPlaylists.map((sp) => ({ id: sp.id, name: sp.name, items: sp.items })), ...localOnly]

      // Upload local-only playlists to server
      for (const lp of localOnly) {
        saveServerPlaylist({ id: lp.id, name: lp.name, items: lp.items }).catch((err) =>
          console.warn('[playlists] Failed to upload local playlist', lp.id, err)
        )
      }

      const activePlaylistId = get().activePlaylistId
      const nextActive =
        activePlaylistId && merged.some((p) => p.id === activePlaylistId)
          ? activePlaylistId
          : merged[0]?.id ?? null

      set({ playlists: merged, activePlaylistId: nextActive, syncing: false })
      persistLocal({ playlists: merged, activePlaylistId: nextActive })

      console.log(
        '[playlists] Loaded from server: %d server, %d local-only, %d total',
        serverPlaylists.length,
        localOnly.length,
        merged.length
      )
    } catch (err) {
      console.warn('[playlists] Failed to load from server:', err)
      set({ syncing: false, lastSyncError: String(err) })
    }
  },
}))

import { create } from 'zustand'
import { useAuthStore } from './authStore'
import {
  listServerPlaylistsMeta,
  getServerPlaylist,
  saveServerPlaylist,
  deleteServerPlaylist,
} from '../network/nakamaClient'

const STORAGE_KEY = 'club-mutant-3d:playlists:v1'

// Mirrors MAX_PLAYLIST_NAME / MAX_TRACKS_PER_PLAYLIST / MAX_PLAYLISTS in
// nakama/modules/index.js — the server silently truncates past these.
export const MAX_PLAYLIST_NAME = 60
export const IMPORT_MAX_TRACKS = 500
export const MAX_PLAYLISTS = 100

export interface PlaylistTrack {
  id: string
  title: string
  link: string
  duration: number
  thumbnail?: string
}

export interface MyPlaylist {
  id: string
  name: string
  items: PlaylistTrack[]
  // false when only metadata has been fetched from the server (lazy
  // loading) — items may be stale or empty until ensureItemsLoaded runs.
  // Absent/true means items are authoritative and safe to sync.
  itemsLoaded?: boolean
  // Server-declared item count, shown while items are not yet loaded.
  trackCount?: number
}

interface PlaylistState {
  playlists: MyPlaylist[]
  activePlaylistId: string | null
  syncing: boolean
  lastSyncError: string | null

  createPlaylist: (name: string) => void
  importPlaylist: (name: string, tracks: PlaylistTrack[]) => string
  removePlaylist: (id: string) => void
  renamePlaylist: (id: string, name: string) => void
  setActivePlaylist: (id: string | null) => void
  addTrack: (playlistId: string, track: PlaylistTrack) => void
  removeTrack: (playlistId: string, trackId: string) => void
  reorderTrack: (playlistId: string, fromIndex: number, toIndex: number) => void
  ensureItemsLoaded: (playlistId: string) => Promise<void>
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
      // Data-loss guard: never save a lazily-listed playlist whose items
      // haven't been fetched — it would overwrite server items with the
      // stale/empty local copy. Fetch items first, then re-sync (this
      // preserves metadata-only changes like renames).
      if (playlist.itemsLoaded === false) {
        usePlaylistStore
          .getState()
          .ensureItemsLoaded(playlistId)
          .then(() => scheduleSyncPlaylist(playlistId))
          .catch((err) => console.warn('[playlists] Deferred sync failed for', playlistId, err))
        return
      }
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

// itemsMutationAllowed blocks item edits on playlists whose items haven't
// been fetched yet (they'd operate on a stale/empty copy). Kicks off the
// fetch so a retry succeeds; UIs should call ensureItemsLoaded before
// showing items, making this a belt-and-braces guard.
function itemsMutationAllowed(playlistId: string, action: string): boolean {
  const playlist = usePlaylistStore.getState().playlists.find((p) => p.id === playlistId)
  if (!playlist || playlist.itemsLoaded !== false) return true
  console.warn(`[playlists] ${action} blocked: playlist ${playlistId} items not loaded yet`)
  void usePlaylistStore.getState().ensureItemsLoaded(playlistId)
  return false
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

  importPlaylist: (name, tracks) => {
    const id = crypto.randomUUID()
    const trimmedName = (name || 'YouTube Playlist').trim().substring(0, MAX_PLAYLIST_NAME)
    const items = tracks.slice(0, IMPORT_MAX_TRACKS)

    set((s) => {
      const next = {
        playlists: [...s.playlists, { id, name: trimmedName, items, itemsLoaded: true }],
        activePlaylistId: s.activePlaylistId ?? id,
      }

      persistLocal(next)
      return next
    })

    scheduleSyncPlaylist(id)
    return id
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
    if (!itemsMutationAllowed(playlistId, 'addTrack')) return
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
    if (!itemsMutationAllowed(playlistId, 'removeTrack')) return
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
    if (!itemsMutationAllowed(playlistId, 'reorderTrack')) return
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

  ensureItemsLoaded: async (playlistId) => {
    const playlist = get().playlists.find((p) => p.id === playlistId)
    if (!playlist || playlist.itemsLoaded !== false) return
    if (!isAuthenticated()) return

    try {
      const server = await getServerPlaylist(playlistId)
      set((s) => {
        const next = {
          playlists: s.playlists.map((p) =>
            p.id === playlistId
              ? // Keep the local name (a rename may be pending sync); items
                // come from the server as the authoritative copy.
                { ...p, items: server.items || [], itemsLoaded: true, trackCount: undefined }
              : p
          ),
          activePlaylistId: s.activePlaylistId,
        }
        persistLocal(next)
        return next
      })
    } catch (err) {
      console.warn('[playlists] Failed to load items for', playlistId, err)
      set({ lastSyncError: String(err) })
      throw err
    }
  },

  loadFromServer: async () => {
    if (!isAuthenticated()) return

    set({ syncing: true, lastSyncError: null })

    try {
      const serverPlaylists = await listServerPlaylistsMeta()
      const localPlaylists = get().playlists
      const localMap = new Map<string, MyPlaylist>()
      for (const lp of localPlaylists) {
        localMap.set(lp.id, lp)
      }

      const serverIds = new Set(serverPlaylists.map((sp) => sp.id))

      // Find local-only playlists (not on server) to upload
      const localOnly: MyPlaylist[] = []
      for (const lp of localPlaylists) {
        if (!serverIds.has(lp.id)) {
          localOnly.push(lp)
        }
      }

      // Server playlists: metadata from the server, items lazily loaded.
      // The locally persisted copy serves as a warm cache; when its item
      // count matches the server's we trust it, otherwise mark unloaded so
      // ensureItemsLoaded refreshes on open.
      const fromServer: MyPlaylist[] = serverPlaylists.map((sp) => {
        const local = localMap.get(sp.id)
        const localItems = local?.items ?? []
        const upToDate = local?.itemsLoaded !== false && localItems.length === sp.trackCount
        return {
          id: sp.id,
          name: sp.name,
          items: localItems,
          itemsLoaded: upToDate,
          trackCount: upToDate ? undefined : sp.trackCount,
        }
      })

      const merged = [...fromServer, ...localOnly]

      // Upload local-only playlists to server
      for (const lp of localOnly) {
        if (lp.itemsLoaded === false) continue // never upload an unloaded copy
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
        '[playlists] Loaded from server: %d server (meta), %d local-only, %d total',
        serverPlaylists.length,
        localOnly.length,
        merged.length
      )

      // Warm the active playlist's items so the primary view is ready.
      if (nextActive) {
        void get().ensureItemsLoaded(nextActive)
      }
    } catch (err) {
      console.warn('[playlists] Failed to load from server:', err)
      set({ syncing: false, lastSyncError: String(err) })
    }
  },
}))

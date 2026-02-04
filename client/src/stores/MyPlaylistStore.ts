import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { PlaylistItem } from '../types/IOfficeState'

const MY_PLAYLIST_STORAGE_KEY = 'club-mutant:my-playlist:v1'

const isPlaylistItem = (value: unknown): value is PlaylistItem => {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.djId === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.link === 'string' &&
    typeof candidate.duration === 'number'
  )
}

type MyPlaylist = {
  id: string
  name: string
  items: PlaylistItem[]
}

type TrackMeta = {
  visualUrl?: string
  trackMessage?: string
}

type PersistedMyPlaylists = {
  playlists: MyPlaylist[]
  activePlaylistId: string | null
  trackMetaById?: Record<string, TrackMeta>
}

const isMyPlaylist = (value: unknown): value is MyPlaylist => {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>

  if (typeof candidate.id !== 'string') return false
  if (typeof candidate.name !== 'string') return false
  if (!Array.isArray(candidate.items)) return false

  return candidate.items.every(isPlaylistItem)
}

const isTrackMeta = (value: unknown): value is TrackMeta => {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>

  const visualUrl = candidate.visualUrl
  const trackMessage = candidate.trackMessage

  if (visualUrl !== undefined && typeof visualUrl !== 'string') return false
  if (trackMessage !== undefined && typeof trackMessage !== 'string') return false

  return true
}

const loadPersisted = (): PersistedMyPlaylists => {
  try {
    const raw = localStorage.getItem(MY_PLAYLIST_STORAGE_KEY)

    if (!raw) return { playlists: [], activePlaylistId: null }

    const parsed: unknown = JSON.parse(raw)

    if (Array.isArray(parsed)) {
      const legacyItems = parsed.filter(isPlaylistItem)

      if (legacyItems.length === 0) {
        return { playlists: [], activePlaylistId: null }
      }

      const legacyPlaylist: MyPlaylist = {
        id: 'legacy',
        name: 'My Playlist',
        items: legacyItems,
      }

      return {
        playlists: [legacyPlaylist],
        activePlaylistId: legacyPlaylist.id,
        trackMetaById: {},
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      return { playlists: [], activePlaylistId: null }
    }

    const candidate = parsed as Record<string, unknown>

    const playlistsRaw = candidate.playlists
    const activePlaylistIdRaw = candidate.activePlaylistId
    const trackMetaByIdRaw = candidate.trackMetaById

    const playlists = Array.isArray(playlistsRaw) ? playlistsRaw.filter(isMyPlaylist) : []
    const activePlaylistId = typeof activePlaylistIdRaw === 'string' ? activePlaylistIdRaw : null

    const trackMetaById: Record<string, TrackMeta> =
      trackMetaByIdRaw && typeof trackMetaByIdRaw === 'object' && !Array.isArray(trackMetaByIdRaw)
        ? Object.entries(trackMetaByIdRaw as Record<string, unknown>).reduce<
            Record<string, TrackMeta>
          >((acc, [k, v]) => {
            if (isTrackMeta(v)) {
              acc[k] = v
            }
            return acc
          }, {})
        : {}

    return { playlists, activePlaylistId, trackMetaById }
  } catch {
    return { playlists: [], activePlaylistId: null }
  }
}

interface MyPlaylistState {
  myPlaylistPanelOpen: boolean
  playQueue: Array<PlaylistItem>
  playlists: Array<MyPlaylist>
  activePlaylistId: string | null
  trackMetaById: Record<string, TrackMeta>
  focused: boolean
}

const persisted = loadPersisted()

const initialState: MyPlaylistState = {
  myPlaylistPanelOpen: false,
  playQueue: new Array<PlaylistItem>(),
  playlists: persisted.playlists,
  activePlaylistId: persisted.activePlaylistId,
  trackMetaById: persisted.trackMetaById ?? {},
  focused: false,
}

export const myPlaylistSlice = createSlice({
  name: 'myPlaylist',
  initialState,
  reducers: {
    syncPlayQueue: (state) => {
      console.log('//reducer syncPlayQueue payload')
      //   if (state.items?.length > 0) {
      //     const stateItemsClone = [...state.items];
      //     const queueItems = stateItemsClone.slice(0, 1)

      //     console.log('REDUCER SYNC QUEUE SLICE', queueItems);
      //     console.log('REDUCER SYNC QUEUE', state.playQueue);

      //     const isFirstEqual = state.playQueue?.[0]?.link === state?.items?.[0]?.link

      //     const isSecondEqual = state.playQueue?.[1]?.link === state?.items?.[1]?.link
      //     if (!isFirstEqual || !isSecondEqual) {
      //       state.playQueue = queueItems
      //     }
      //   }
    },
    removeFromPlayQueue: (state, action: PayloadAction<PlaylistItem>) => {
      console.log('////REMOVE FROM PLAYLIST QUEUE', action.payload)

      state.playQueue = state.playQueue.filter((item) => item.link !== action.payload.link)
    },
    shiftMyPlaylist: (state) => {
      const activeId = state.activePlaylistId
      if (!activeId) return

      const playlist = state.playlists.find((p) => p.id === activeId)
      if (!playlist) return

      playlist.items = playlist.items.slice(1)
    },
    createPlaylist: (state, action: PayloadAction<{ id: string; name: string }>) => {
      const { id, name } = action.payload

      state.playlists.push({ id, name, items: [] })

      if (state.activePlaylistId === null) {
        state.activePlaylistId = id
      }
    },
    renamePlaylist: (state, action: PayloadAction<{ id: string; name: string }>) => {
      const { id, name } = action.payload

      const playlist = state.playlists.find((p) => p.id === id)
      if (!playlist) return

      playlist.name = name
    },
    removePlaylist: (state, action: PayloadAction<{ id: string }>) => {
      const { id } = action.payload

      const removed = state.playlists.find((p) => p.id === id)

      state.playlists = state.playlists.filter((p) => p.id !== id)

      if (removed) {
        for (const item of removed.items) {
          delete state.trackMetaById[item.id]
        }
      }

      if (state.activePlaylistId === id) {
        state.activePlaylistId = state.playlists[0]?.id ?? null
      }
    },
    setActivePlaylistId: (state, action: PayloadAction<string | null>) => {
      state.activePlaylistId = action.payload
    },
    addItemToMyPlaylist: (
      state,
      action: PayloadAction<{ playlistId: string; item: PlaylistItem }>
    ) => {
      const { playlistId, item } = action.payload
      const playlist = state.playlists.find((p) => p.id === playlistId)
      if (!playlist) return

      playlist.items.push(item)
    },
    reorderPlaylistItems: (
      state,
      action: PayloadAction<{ playlistId: string; fromIndex: number; toIndex: number }>
    ) => {
      const { playlistId, fromIndex, toIndex } = action.payload

      const playlist = state.playlists.find((p) => p.id === playlistId)
      if (!playlist) return

      if (fromIndex === toIndex) return
      if (fromIndex < 0 || toIndex < 0) return
      if (fromIndex >= playlist.items.length) return
      if (toIndex >= playlist.items.length) return

      const [item] = playlist.items.splice(fromIndex, 1)
      if (!item) return

      playlist.items.splice(toIndex, 0, item)
    },
    removeItemFromMyPlaylist: (
      state,
      action: PayloadAction<{ playlistId: string; itemId: string }>
    ) => {
      const { playlistId, itemId } = action.payload
      const playlist = state.playlists.find((p) => p.id === playlistId)
      if (!playlist) return

      playlist.items = playlist.items.filter((i) => i.id !== itemId)

      delete state.trackMetaById[itemId]
    },
    updateTrackMeta: (state, action: PayloadAction<{ trackId: string; patch: TrackMeta }>) => {
      const { trackId, patch } = action.payload

      state.trackMetaById[trackId] = {
        ...state.trackMetaById[trackId],
        ...patch,
      }
    },
    clearTrackMeta: (state, action: PayloadAction<{ trackId: string }>) => {
      const { trackId } = action.payload

      delete state.trackMetaById[trackId]
    },
    openMyPlaylistPanel: (state) => {
      state.myPlaylistPanelOpen = true
    },
    closeMyPlaylistPanel: (state) => {
      state.myPlaylistPanelOpen = false
      state.focused = false
    },
    setFocused: (state, action: PayloadAction<boolean>) => {
      state.focused = action.payload
    },
  },
})

export const {
  syncPlayQueue,
  addItemToMyPlaylist,
  removeItemFromMyPlaylist,
  createPlaylist,
  renamePlaylist,
  removePlaylist,
  setActivePlaylistId,
  reorderPlaylistItems,
  updateTrackMeta,
  clearTrackMeta,
  openMyPlaylistPanel,
  closeMyPlaylistPanel,
  setFocused,
  shiftMyPlaylist,
  removeFromPlayQueue,
} = myPlaylistSlice.actions

export default myPlaylistSlice.reducer

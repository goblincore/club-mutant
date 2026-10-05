import type { PlaylistService } from '../../../../packages/konpyuuta/src/types'
import { usePlaylistStore } from '../../stores/playlistStore'

/** The same playlist library for the game desktop and development preview. */
export function createPlaylistService(): PlaylistService {
  const store = usePlaylistStore.getState
  return {
    getPlaylists: () => store().playlists,
    subscribe: (listener) => usePlaylistStore.subscribe(listener),
    getSyncError: () => store().lastSyncError,
    createPlaylist: (name) => store().createPlaylist(name),
    renamePlaylist: (id, name) => store().renamePlaylist(id, name),
    reorderTrack: (id, from, to) => store().reorderTrack(id, from, to),
    importPlaylist: (name, tracks) => store().importPlaylist(name, tracks),
    removePlaylist: (id) => store().removePlaylist(id),
    addTrack: (id, track) => store().addTrack(id, track),
    removeTrack: (id, trackId) => store().removeTrack(id, trackId),
    ensureItemsLoaded: (id) => store().ensureItemsLoaded(id),
    loadFromServer: () => store().loadFromServer(),
  }
}

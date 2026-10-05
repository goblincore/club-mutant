import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
vi.mock('../authStore', () => ({ useAuthStore: { getState: () => ({ isAuthenticated: false }) } }))
vi.mock('../../network/nakamaClient', () => ({
  listServerPlaylistsMeta: vi.fn(), getServerPlaylist: vi.fn(), saveServerPlaylist: vi.fn(), deleteServerPlaylist: vi.fn(),
}))
const { usePlaylistStore, MAX_PLAYLISTS, IMPORT_MAX_TRACKS } = await import('../playlistStore')
const track = { id: 'track-1', title: 'VHS', link: 'https://youtu.be/dQw4w9WgXcQ', duration: 0 }

beforeEach(() => usePlaylistStore.setState({ playlists: [], activePlaylistId: null }))
describe('MutantTube playlist storage regressions', () => {
  it('returns the real created ID so the first video can be added to a new playlist', () => {
    const id = usePlaylistStore.getState().createPlaylist(' Sunday VHS ')
    usePlaylistStore.getState().addTrack(id, track)
    expect(usePlaylistStore.getState().playlists).toEqual([{ id, name: 'Sunday VHS', items: [track] }])
  })
  it('refuses unloaded item edits instead of silently reporting success', () => {
    usePlaylistStore.setState({ playlists: [{ id: 'lazy', name: 'Lazy', items: [], itemsLoaded: false, trackCount: 20 }] })
    expect(() => usePlaylistStore.getState().addTrack('lazy', track)).toThrow('still loading')
    expect(() => usePlaylistStore.getState().removeTrack('lazy', 'track-1')).toThrow('still loading')
    expect(usePlaylistStore.getState().playlists[0].items).toEqual([])
  })
  it('enforces server limits before showing local-only success', () => {
    usePlaylistStore.setState({ playlists: Array.from({ length: MAX_PLAYLISTS }, (_, i) => ({ id: String(i), name: 'VHS', items: [] })) })
    expect(() => usePlaylistStore.getState().createPlaylist('Overflow')).toThrow('limit')
    expect(() => usePlaylistStore.getState().importPlaylist('Overflow', [track])).toThrow('limit')
    usePlaylistStore.setState({ playlists: [{ id: 'full', name: 'Full', items: Array.from({ length: IMPORT_MAX_TRACKS }, () => track) }] })
    expect(() => usePlaylistStore.getState().addTrack('full', track)).toThrow('500')
  })
  it('keeps invalid reorders from introducing undefined tracks', () => {
    const id = usePlaylistStore.getState().createPlaylist('VHS')
    usePlaylistStore.getState().addTrack(id, track)
    usePlaylistStore.getState().reorderTrack(id, 20, 0)
    expect(usePlaylistStore.getState().playlists[0].items).toEqual([track])
  })
})

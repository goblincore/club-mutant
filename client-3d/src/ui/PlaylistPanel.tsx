import { useState, useCallback, useRef } from 'react'

import { getNetwork } from '../network/NetworkManager'
import { useToastStore } from '../stores/toastStore'
import { useBoothStore } from '../stores/boothStore'
import { useGameStore } from '../stores/gameStore'
import { useMusicStore } from '../stores/musicStore'
import { useUIStore } from '../stores/uiStore'
import { useJukeboxStore } from '../stores/jukeboxStore'
import { usePlaylistStore, type PlaylistTrack } from '../stores/playlistStore'

interface SearchResult {
  title: string
  videoId: string
  duration?: number
  thumbnail?: string
}

// Fully leave the booth: disconnect, leave queue, close panel, unlock movement
function leaveBooth() {
  getNetwork().disconnectFromBooth() // disconnect first (server guard check still sees active queue)
  getNetwork().leaveDJQueue() // then leave queue (handles music stop)
  useUIStore.getState().setPlaylistOpen(false)
}

type BoothTab = 'queue' | 'playlists'
type JukeboxTab = 'jukebox' | 'playlists'
type PlaylistDetailTab = 'tracks' | 'search' | 'link'

export function PlaylistPanel() {
  const isConnected = useBoothStore((s) => s.isConnected)
  const isInQueue = useBoothStore((s) => s.isInQueue)
  const djQueue = useBoothStore((s) => s.djQueue)
  const currentDjSessionId = useBoothStore((s) => s.currentDjSessionId)
  const queuePlaylist = useBoothStore((s) => s.queuePlaylist)
  const mySessionId = useGameStore((s) => s.mySessionId)
  const musicMode = useGameStore((s) => s.musicMode)
  const stream = useMusicStore((s) => s.stream)
  const jukeboxPlaylist = useJukeboxStore((s) => s.playlist)

  const playlists = usePlaylistStore((s) => s.playlists)
  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId)

  const isCurrentDJ = currentDjSessionId === mySessionId
  const myQueuePos = djQueue.findIndex((e) => e.sessionId === mySessionId) + 1
  const isJukeboxMode = musicMode === 'jukebox' || musicMode === 'personal'

  // Tabs
  const [boothTab, setBoothTab] = useState<BoothTab>('queue')
  const [jukeboxTab, setJukeboxTab] = useState<JukeboxTab>('jukebox')

  // Playlist navigation
  const [viewingPlaylistId, setViewingPlaylistId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<PlaylistDetailTab>('tracks')

  // Search (playlist detail tab)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [linkInput, setLinkInput] = useState('')

  // Queue search (DJ Queue tab — searches playlists + YouTube)
  const [queueSearchQuery, setQueueSearchQuery] = useState('')
  const [queueSearchYTResults, setQueueSearchYTResults] = useState<SearchResult[]>([])
  const [queueSearching, setQueueSearching] = useState(false)

  // Jukebox search (Jukebox tab — searches playlists + YouTube)
  const [jbSearchQuery, setJbSearchQuery] = useState('')
  const [jbSearchYTResults, setJbSearchYTResults] = useState<SearchResult[]>([])
  const [jbSearching, setJbSearching] = useState(false)

  // Playlist management
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [creating, setCreating] = useState(false)

  // Inline feedback: tracks recently added (shows checkmark briefly)
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set())

  const markAdded = useCallback((key: string) => {
    setRecentlyAdded((prev) => new Set(prev).add(key))

    setTimeout(() => {
      setRecentlyAdded((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }, 1800)
  }, [])

  // Drag-and-drop state
  const dragSrc = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const viewingPlaylist = playlists.find((p) => p.id === viewingPlaylistId) ?? null

  // ── Jukebox search handler ──
  const handleJbSearch = useCallback(async () => {
    const q = jbSearchQuery.trim()
    if (!q) {
      setJbSearchYTResults([])
      return
    }

    setJbSearching(true)

    try {
      const results = await getNetwork().searchYouTube(q)

      setJbSearchYTResults(
        results.map((r: any) => ({
          title: r.title ?? r.Title ?? 'Unknown',
          videoId: r.id ?? r.Id ?? r.videoId ?? '',
          duration: r.duration ?? r.Duration ?? 0,
          thumbnail: extractThumbnail(r.thumbnail ?? r.Thumbnail),
        }))
      )
    } catch (err) {
      console.error('Jukebox search failed:', err)
    } finally {
      setJbSearching(false)
    }
  }, [jbSearchQuery])

  // Local playlist matches for jukebox search
  const jbSearchLocalMatches: { playlistName: string; track: PlaylistTrack }[] = (() => {
    const q = jbSearchQuery.trim().toLowerCase()
    if (!q) return []

    const matches: { playlistName: string; track: PlaylistTrack }[] = []

    for (const pl of playlists) {
      for (const track of pl.items) {
        if (track.title.toLowerCase().includes(q)) {
          matches.push({ playlistName: pl.name, track })
        }
      }
    }

    return matches.slice(0, 10)
  })()

  // Add search result to jukebox
  const handleAddSearchResultToJukebox = useCallback(
    (result: SearchResult) => {
      const link = `https://www.youtube.com/watch?v=${result.videoId}`

      getNetwork().addToJukebox(result.title, link, result.duration ?? 0)

      markAdded(`jbsearch-${result.videoId}`)
      useToastStore.getState().addToast('added to jukebox')
    },
    [markAdded]
  )

  // Add local track to jukebox
  const handleAddLocalTrackToJukebox = useCallback(
    (track: PlaylistTrack) => {
      getNetwork().addToJukebox(track.title, track.link, track.duration)

      markAdded(`jblocal-${track.id}`)
      useToastStore.getState().addToast('added to jukebox')
    },
    [markAdded]
  )

  // Queue search: searches user playlists locally + YouTube remotely
  const handleQueueSearch = useCallback(async () => {
    const q = queueSearchQuery.trim()
    if (!q) {
      setQueueSearchYTResults([])
      return
    }

    setQueueSearching(true)

    try {
      const results = await getNetwork().searchYouTube(q)

      setQueueSearchYTResults(
        results.map((r: any) => ({
          title: r.title ?? r.Title ?? 'Unknown',
          videoId: r.id ?? r.Id ?? r.videoId ?? '',
          duration: r.duration ?? r.Duration ?? 0,
          thumbnail: extractThumbnail(r.thumbnail ?? r.Thumbnail),
        }))
      )
    } catch (err) {
      console.error('Queue search failed:', err)
    } finally {
      setQueueSearching(false)
    }
  }, [queueSearchQuery])

  // Local playlist matches for the queue search
  const queueSearchLocalMatches: { playlistName: string; track: PlaylistTrack }[] = (() => {
    const q = queueSearchQuery.trim().toLowerCase()
    if (!q) return []

    const matches: { playlistName: string; track: PlaylistTrack }[] = []

    for (const pl of playlists) {
      for (const track of pl.items) {
        if (track.title.toLowerCase().includes(q)) {
          matches.push({ playlistName: pl.name, track })
        }
      }
    }

    return matches.slice(0, 10)
  })()

  // Add a search result directly to the DJ queue (from queue search)
  const handleAddSearchResultToQueue = useCallback(
    (result: SearchResult) => {
      const link = `https://www.youtube.com/watch?v=${result.videoId}`

      getNetwork().addToQueuePlaylist(result.title, link, result.duration ?? 0)

      markAdded(`qsearch-${result.videoId}`)
      useToastStore.getState().addToast('added to dj queue')
    },
    [markAdded]
  )

  // Add a local playlist track directly to the DJ queue (from queue search)
  const handleAddLocalTrackToQueue = useCallback(
    (track: PlaylistTrack) => {
      getNetwork().addToQueuePlaylist(track.title, track.link, track.duration)

      markAdded(`qlocal-${track.id}`)
      useToastStore.getState().addToast('added to dj queue')
    },
    [markAdded]
  )

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim()
    if (!q) return

    setSearching(true)

    try {
      const results = await getNetwork().searchYouTube(q)

      setSearchResults(
        results.map((r: any) => ({
          title: r.title ?? r.Title ?? 'Unknown',
          videoId: r.id ?? r.Id ?? r.videoId ?? '',
          duration: r.duration ?? r.Duration ?? 0,
          thumbnail: extractThumbnail(r.thumbnail ?? r.Thumbnail),
        }))
      )
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setSearching(false)
    }
  }, [searchQuery])

  // Search always adds to the currently viewed playlist
  const handleAddFromSearch = useCallback(
    (result: SearchResult) => {
      const targetId = viewingPlaylistId ?? activePlaylistId
      if (!targetId) return

      const link = `https://www.youtube.com/watch?v=${result.videoId}`

      usePlaylistStore.getState().addTrack(targetId, {
        id: crypto.randomUUID(),
        title: result.title,
        link,
        duration: result.duration ?? 0,
      })

      const pl = usePlaylistStore.getState().playlists.find((p) => p.id === targetId)

      markAdded(`search-${result.videoId}`)
      useToastStore.getState().addToast(`added to ${pl?.name ?? 'playlist'}`)
    },
    [viewingPlaylistId, activePlaylistId, markAdded]
  )

  const handleAddLink = useCallback(() => {
    const url = linkInput.trim()
    if (!url) return

    const videoId = extractVideoId(url)
    if (!videoId) return

    const targetId = viewingPlaylistId ?? activePlaylistId
    if (!targetId) return

    const link = `https://www.youtube.com/watch?v=${videoId}`

    usePlaylistStore.getState().addTrack(targetId, {
      id: crypto.randomUUID(),
      title: 'YouTube Video',
      link,
      duration: 0,
    })

    const pl = usePlaylistStore.getState().playlists.find((p) => p.id === targetId)

    useToastStore.getState().addToast(`link added to ${pl?.name ?? 'playlist'}`)
    setLinkInput('')
  }, [linkInput, viewingPlaylistId, activePlaylistId])

  const handleCreatePlaylist = () => {
    const name = newPlaylistName.trim()
    if (!name) return

    usePlaylistStore.getState().createPlaylist(name)
    setNewPlaylistName('')
    setCreating(false)
  }

  // Add a single track from playlist to DJ queue or jukebox
  const handleAddTrackToQueue = (track: PlaylistTrack) => {
    if (isJukeboxMode) {
      getNetwork().addToJukebox(track.title, track.link, track.duration)
      markAdded(`queue-${track.id}`)
      useToastStore.getState().addToast('added to jukebox')
    } else {
      getNetwork().addToQueuePlaylist(track.title, track.link, track.duration)
      markAdded(`queue-${track.id}`)
      useToastStore.getState().addToast('added to dj queue')
    }
  }

  // Add all tracks from a playlist to DJ queue or jukebox
  const handleAddAllToQueue = (playlistId: string) => {
    const pl = playlists.find((p) => p.id === playlistId)
    if (!pl || pl.items.length === 0) return

    if (isJukeboxMode) {
      for (const track of pl.items) {
        getNetwork().addToJukebox(track.title, track.link, track.duration)
      }
      markAdded(`all-${playlistId}`)
      useToastStore.getState().addToast(`added ${pl.items.length} tracks to jukebox`)
    } else {
      for (const track of pl.items) {
        getNetwork().addToQueuePlaylist(track.title, track.link, track.duration)
      }
      markAdded(`all-${playlistId}`)
      useToastStore.getState().addToast(`added ${pl.items.length} tracks to dj queue`)
    }
  }

  const handleRemoveQueueTrack = useCallback((id: string) => {
    getNetwork().removeFromQueuePlaylist(id)
  }, [])

  const handleRemoveJukeboxTrack = useCallback((id: string) => {
    getNetwork().removeFromJukebox(id)
  }, [])

  // ---------- Jukebox Tab Content ----------

  const jukeboxTabContent = (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Jukebox search bar */}
      <div className="px-3 py-2 border-b border-white/[0.1]">
        <div className="flex gap-1">
          <input
            type="text"
            value={jbSearchQuery}
            onChange={(e) => setJbSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJbSearch()
              if (e.key === 'Escape') {
                setJbSearchQuery('')
                setJbSearchYTResults([])
              }
            }}
            placeholder="search to add tracks..."
            className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none font-mono"
          />

          {jbSearchQuery.trim() ? (
            <button
              onClick={() => {
                setJbSearchQuery('')
                setJbSearchYTResults([])
              }}
              className="px-2 py-1.5 text-[12px] font-mono text-white/50 hover:text-white transition-colors"
              title="Clear search"
            >
              ✕
            </button>
          ) : null}

          <button
            onClick={handleJbSearch}
            disabled={jbSearching}
            className="px-2.5 py-1.5 text-[12px] font-mono bg-white/10 border border-white/20 rounded text-white/80 hover:text-white transition-colors disabled:opacity-30"
          >
            {jbSearching ? '...' : 'go'}
          </button>
        </div>
      </div>

      {/* Search results (shown when there's a query) */}
      {jbSearchQuery.trim() &&
      (jbSearchLocalMatches.length > 0 || jbSearchYTResults.length > 0) ? (
        <div className="flex-1 overflow-y-auto px-3 py-1">
          {/* Playlist matches */}
          {jbSearchLocalMatches.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1 mt-1">
                from your playlists
              </div>

              {jbSearchLocalMatches.map(({ playlistName, track }) => (
                <div
                  key={`local-${track.id}`}
                  className="flex items-center gap-2 py-1.5 border-b border-white/[0.05] group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-mono text-white/90 truncate">
                      {track.title}
                    </div>

                    <div className="text-[10px] font-mono text-white/40 truncate">
                      {playlistName}
                      {track.duration > 0 && ` · ${formatDuration(track.duration)}`}
                    </div>
                  </div>

                  <button
                    onClick={() => handleAddLocalTrackToJukebox(track)}
                    className={`text-[12px] font-mono px-2 py-1 border rounded transition-colors flex-shrink-0 ${
                      recentlyAdded.has(`jblocal-${track.id}`)
                        ? 'bg-green-500/20 border-green-500/30 text-green-400 opacity-100'
                        : 'bg-green-500/15 border-green-500/25 text-green-400 hover:bg-green-500/25 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {recentlyAdded.has(`jblocal-${track.id}`) ? '✓' : '+'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* YouTube results */}
          {jbSearchYTResults.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1 mt-1">
                from youtube
              </div>

              {jbSearchYTResults.map((result) => (
                <div
                  key={`yt-${result.videoId}`}
                  className="flex items-center gap-2 py-1.5 border-b border-white/[0.05] group"
                >
                  {result.thumbnail && (
                    <img
                      src={result.thumbnail}
                      alt=""
                      className="w-10 h-7 rounded object-cover flex-shrink-0"
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-mono text-white/90 truncate">
                      {result.title}
                    </div>

                    {result.duration ? (
                      <div className="text-[10px] font-mono text-white/50">
                        {formatDuration(result.duration)}
                      </div>
                    ) : null}
                  </div>

                  <button
                    onClick={() => handleAddSearchResultToJukebox(result)}
                    className={`text-[12px] font-mono px-2 py-1 border rounded transition-colors flex-shrink-0 ${
                      recentlyAdded.has(`jbsearch-${result.videoId}`)
                        ? 'bg-green-500/20 border-green-500/30 text-green-400 opacity-100'
                        : 'bg-green-500/15 border-green-500/25 text-green-400 hover:bg-green-500/25 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {recentlyAdded.has(`jbsearch-${result.videoId}`) ? '✓' : '+'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {jbSearching && (
            <p className="text-white/40 text-[12px] font-mono text-center mt-2">
              searching youtube...
            </p>
          )}
        </div>
      ) : (
        /* Jukebox track list (default view) */
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {jukeboxPlaylist.length === 0 && (
            <p className="text-white/40 text-[12px] font-mono mt-2">
              no tracks — use the search bar above to add tracks
            </p>
          )}

          {jukeboxPlaylist.map((track, i) => {
            const isNowPlaying = i === 0 && stream.isPlaying
            const isMine = track.addedBySessionId === mySessionId

            return (
              <div
                key={track.id}
                className={`flex items-center justify-between py-1 ${
                  isNowPlaying ? 'bg-purple-500/10 rounded px-1 -mx-1' : ''
                }`}
              >
                <div className="text-[12px] font-mono text-white/90 truncate flex-1 mr-2">
                  <span className="text-white/40 mr-1">{i + 1}.</span>
                  {track.title}
                  {isNowPlaying && <span className="text-green-400/60 ml-1">♪</span>}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {track.duration > 0 && (
                    <span className="text-[10px] font-mono text-white/40">
                      {formatDuration(track.duration)}
                    </span>
                  )}

                  <span className="text-[10px] font-mono text-white/30 max-w-[60px] truncate">
                    {track.addedByName}
                  </span>

                  {isMine && (
                    <button
                      onClick={() => handleRemoveJukeboxTrack(track.id)}
                      className="text-[12px] text-white/50 hover:text-red-400 transition-colors"
                      title="Remove your track"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ---------- Playlist Detail View (Tracks / Search / Link sub-tabs) ----------

  const queueLabel = isJukeboxMode ? 'jukebox' : 'dj queue'

  const playlistDetailView = viewingPlaylist ? (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Detail header: ← Back + playlist name */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.1]">
        <button
          onClick={() => {
            setViewingPlaylistId(null)
            setDetailTab('tracks')
            setSearchResults([])
            setSearchQuery('')
          }}
          className="text-[11px] font-mono text-white/60 hover:text-white flex items-center gap-1 flex-shrink-0"
        >
          ← Back
        </button>

        <span className="text-[13px] font-mono text-white/90 truncate flex-1 text-center">
          {viewingPlaylist.name}
        </span>

        {/* Spacer to balance the back button */}
        <div className="w-10 flex-shrink-0" />
      </div>

      {/* Sub-tabs: Tracks / Search / Link */}
      <div className="flex border-b border-white/[0.15]">
        {(['tracks', 'search', 'link'] as PlaylistDetailTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setDetailTab(t)}
            className={`flex-1 py-2 text-[13px] font-mono text-center transition-colors ${
              detailTab === t
                ? 'text-purple-300 border-b-2 border-purple-400'
                : 'text-white/60 hover:text-white/80'
            }`}
          >
            {t === 'tracks' ? 'Tracks' : t === 'search' ? 'Search' : 'Link'}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {detailTab === 'tracks' ? (
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {viewingPlaylist.items.length > 0 && (
            <button
              onClick={() => handleAddAllToQueue(viewingPlaylist.id)}
              className={`mb-2 w-full py-1.5 text-[12px] font-mono border rounded transition-colors ${
                recentlyAdded.has(`all-${viewingPlaylist.id}`)
                  ? 'bg-green-500/25 border-green-500/40 text-green-300'
                  : 'bg-green-500/15 border-green-500/25 text-green-400 hover:bg-green-500/25'
              }`}
            >
              {recentlyAdded.has(`all-${viewingPlaylist.id}`)
                ? `✓ added to ${queueLabel}`
                : `+ add all to ${queueLabel}`}
            </button>
          )}

          {viewingPlaylist.items.length === 0 && (
            <p className="text-white/40 text-[12px] font-mono text-center mt-4">
              no tracks yet — use Search or Link tabs to add
            </p>
          )}

          {viewingPlaylist.items.map((track, i) => (
            <div
              key={track.id}
              draggable
              onDragStart={(e) => {
                dragSrc.current = i
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverIdx(i)
              }}
              onDragLeave={() => setDragOverIdx(null)}
              onDrop={(e) => {
                e.preventDefault()
                const from = dragSrc.current
                if (from !== null && from !== i) {
                  usePlaylistStore.getState().reorderTrack(viewingPlaylist.id, from, i)
                }
                dragSrc.current = null
                setDragOverIdx(null)
              }}
              onDragEnd={() => {
                dragSrc.current = null
                setDragOverIdx(null)
              }}
              className={`flex items-center py-1.5 border-b group cursor-grab active:cursor-grabbing ${
                dragOverIdx === i ? 'border-purple-400/60 bg-purple-500/10' : 'border-white/[0.05]'
              }`}
            >
              {/* Drag handle */}
              <span className="text-[10px] text-white/40 mr-1.5 flex-shrink-0 select-none">⠿</span>

              <div className="flex-1 min-w-0 mr-2">
                <div className="text-[12px] font-mono text-white/90 truncate">{track.title}</div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {track.duration > 0 && (
                  <span className="text-[11px] font-mono text-white/50 mr-1">
                    {formatDuration(track.duration)}
                  </span>
                )}

                <button
                  onClick={() =>
                    usePlaylistStore.getState().removeTrack(viewingPlaylist.id, track.id)
                  }
                  className="w-6 h-6 flex items-center justify-center text-[12px] text-white/45 hover:text-red-400 transition-colors"
                  title="Delete track"
                >
                  🗑
                </button>

                <button
                  onClick={() => handleAddTrackToQueue(track)}
                  className={`w-6 h-6 flex items-center justify-center text-[13px] transition-colors ${
                    recentlyAdded.has(`queue-${track.id}`)
                      ? 'text-green-400'
                      : 'text-white/45 hover:text-green-400'
                  }`}
                  title={`Add to ${queueLabel}`}
                >
                  {recentlyAdded.has(`queue-${track.id}`) ? '✓' : '+'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : detailTab === 'search' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-white/[0.1]">
            <div className="flex gap-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="search youtube..."
                className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none font-mono"
              />

              <button
                onClick={handleSearch}
                disabled={searching}
                className="px-2.5 py-1.5 text-[12px] font-mono bg-white/10 border border-white/20 rounded text-white/80 hover:text-white transition-colors disabled:opacity-30"
              >
                {searching ? '...' : 'go'}
              </button>
            </div>
          </div>

          <div className="px-3 py-1 border-b border-white/[0.06]">
            <span className="text-[10px] font-mono text-white/45">
              adding to: {viewingPlaylist.name}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-1">
            {searchResults.length === 0 && !searching && (
              <p className="text-white/40 text-[12px] font-mono text-center mt-4">
                search for tracks to add to this playlist
              </p>
            )}

            {searchResults.map((result) => (
              <div
                key={result.videoId}
                className="flex items-center gap-2 py-1.5 border-b border-white/[0.05] group"
              >
                {result.thumbnail && (
                  <img
                    src={result.thumbnail}
                    alt=""
                    className="w-10 h-7 rounded object-cover flex-shrink-0"
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-mono text-white/90 truncate">{result.title}</div>

                  {result.duration ? (
                    <div className="text-[10px] font-mono text-white/50">
                      {formatDuration(result.duration)}
                    </div>
                  ) : null}
                </div>

                <button
                  onClick={() => handleAddFromSearch(result)}
                  className={`text-[12px] font-mono px-2 py-1 border rounded transition-colors flex-shrink-0 ${
                    recentlyAdded.has(`search-${result.videoId}`)
                      ? 'bg-green-500/20 border-green-500/30 text-green-400 opacity-100'
                      : 'bg-purple-500/20 border-purple-500/30 text-purple-400 hover:bg-purple-500/30 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {recentlyAdded.has(`search-${result.videoId}`) ? '✓' : '+'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Link tab */
        <div className="flex-1 flex flex-col px-3 py-3">
          <div className="flex gap-1">
            <input
              type="text"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
              placeholder="paste youtube link..."
              className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[13px] text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none font-mono"
            />

            <button
              onClick={handleAddLink}
              className="px-2.5 py-1.5 text-[13px] font-mono bg-purple-500/20 border border-purple-500/30 rounded text-purple-400 hover:bg-purple-500/30 transition-colors"
            >
              add
            </button>
          </div>

          <p className="text-white/40 text-[13px] font-mono mt-3">
            paste a YouTube URL to add it to{' '}
            <span className="text-white/60">{viewingPlaylist.name}</span>
          </p>
        </div>
      )}
    </div>
  ) : null

  // ---------- Playlist List View ----------

  const playlistListView = (
    <div className="flex-1 overflow-y-auto px-3 py-2">
      {playlists.length === 0 && !creating && (
        <p className="text-white/40 text-[13px] font-mono text-center mt-4">
          no playlists yet — create one to start saving tracks
        </p>
      )}

      {playlists.map((pl) => (
        <div
          key={pl.id}
          className="flex items-center justify-between py-1.5 border-b border-white/[0.05] group cursor-pointer hover:bg-white/[0.03] rounded px-1 -mx-1"
          onClick={() => {
            setViewingPlaylistId(pl.id)
            setDetailTab('tracks')
            usePlaylistStore.getState().setActivePlaylist(pl.id)
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-mono text-white/90">{pl.name}</div>

            <div className="text-[12px] font-mono text-white/50">
              {pl.items.length} track{pl.items.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="flex gap-1 flex-shrink-0">
            {pl.items.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleAddAllToQueue(pl.id)
                }}
                className={`text-[12px] font-mono px-1.5 py-0.5 transition-colors ${
                  recentlyAdded.has(`all-${pl.id}`)
                    ? 'text-green-400 opacity-100'
                    : 'text-green-400/60 hover:text-green-400 opacity-0 group-hover:opacity-100'
                }`}
              >
                {recentlyAdded.has(`all-${pl.id}`) ? '✓ added' : '+all'}
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation()
                usePlaylistStore.getState().removePlaylist(pl.id)
              }}
              className="text-[13px] text-white/40 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      {/* Create playlist */}
      {creating ? (
        <div className="flex gap-1 mt-2">
          <input
            type="text"
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
            placeholder="playlist name..."
            className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[13px] text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none font-mono"
            autoFocus
          />

          <button
            onClick={handleCreatePlaylist}
            className="px-2.5 py-1.5 text-[13px] font-mono bg-purple-500/20 border border-purple-500/30 rounded text-purple-400 hover:bg-purple-500/30 transition-colors"
          >
            create
          </button>

          <button
            onClick={() => {
              setCreating(false)
              setNewPlaylistName('')
            }}
            className="px-2 py-1.5 text-[13px] font-mono text-white/50 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="mt-2 w-full py-2 text-[12px] font-mono text-white/50 hover:text-white/80 border border-dashed border-white/10 hover:border-white/20 rounded transition-colors"
        >
          + new playlist
        </button>
      )}
    </div>
  )

  // ---------- My Playlists content (list or detail) ----------

  const myPlaylistsContent =
    viewingPlaylistId && viewingPlaylist ? playlistDetailView : playlistListView

  // ==========================================
  // JUKEBOX / PERSONAL MODE LAYOUT
  // ==========================================
  if (isJukeboxMode) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.15]">
          <span className="text-[13px] font-mono text-purple-300 flex-1 truncate">
            {musicMode === 'personal' ? '● boombox' : '● jukebox'}
            {jukeboxPlaylist.length > 0 && ` (${jukeboxPlaylist.length})`}
          </span>

          <button
            onClick={() => useUIStore.getState().setPlaylistMinimized(true)}
            className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition-colors rounded hover:bg-white/10 flex-shrink-0"
            title="Minimize panel"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>

        {/* 2 tabs: Jukebox / My Playlists */}
        <div className="flex border-b border-white/[0.15]">
          {(['jukebox', 'playlists'] as JukeboxTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setJukeboxTab(t)}
              className={`flex-1 py-2 text-[13px] font-mono text-center transition-colors ${
                jukeboxTab === t
                  ? 'text-purple-300 border-b-2 border-purple-400'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              {t === 'jukebox'
                ? musicMode === 'personal'
                  ? `Boombox (${jukeboxPlaylist.length})`
                  : `Jukebox (${jukeboxPlaylist.length})`
                : 'My Playlists'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {jukeboxTab === 'jukebox' ? jukeboxTabContent : myPlaylistsContent}
      </div>
    )
  }

  // ==========================================
  // DJ QUEUE MODE — BOOTH CONNECTED LAYOUT
  // ==========================================
  if (isConnected) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.15]">
          <button
            onClick={() => useUIStore.getState().setPlaylistMinimized(true)}
            className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition-colors rounded hover:bg-white/10 flex-shrink-0"
            title="Minimize panel"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>

          <span className="text-[13px] font-mono text-green-400 flex-1 truncate">
            {isCurrentDJ
              ? '● you are the dj'
              : isInQueue
                ? `● queue ${myQueuePos}/${djQueue.length}`
                : '● booth'}
          </span>

          <button
            onClick={leaveBooth}
            className="flex items-center gap-1 text-[12px] font-mono px-2.5 py-1 bg-red-500/15 border border-red-500/30 rounded text-red-400 hover:bg-red-500/30 transition-colors flex-shrink-0"
          >
            leave
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>

        {/* 2 tabs: DJ Queue / My Playlists */}
        <div className="flex border-b border-white/[0.15]">
          {(['queue', 'playlists'] as BoothTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setBoothTab(t)}
              className={`flex-1 py-2 text-[13px] font-mono text-center transition-colors ${
                boothTab === t
                  ? 'text-purple-300 border-b-2 border-purple-400'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              {t === 'queue'
                ? `DJ Queue (${queuePlaylist.filter((tr) => !tr.played).length})`
                : 'My Playlists'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {boothTab === 'queue' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Queue search bar */}
            <div className="px-3 py-2 border-b border-white/[0.1]">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={queueSearchQuery}
                  onChange={(e) => setQueueSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleQueueSearch()
                    if (e.key === 'Escape') {
                      setQueueSearchQuery('')
                      setQueueSearchYTResults([])
                    }
                  }}
                  placeholder="search to add tracks..."
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none font-mono"
                />

                {queueSearchQuery.trim() ? (
                  <button
                    onClick={() => {
                      setQueueSearchQuery('')
                      setQueueSearchYTResults([])
                    }}
                    className="px-2 py-1.5 text-[12px] font-mono text-white/50 hover:text-white transition-colors"
                    title="Clear search"
                  >
                    ✕
                  </button>
                ) : null}

                <button
                  onClick={handleQueueSearch}
                  disabled={queueSearching}
                  className="px-2.5 py-1.5 text-[12px] font-mono bg-white/10 border border-white/20 rounded text-white/80 hover:text-white transition-colors disabled:opacity-30"
                >
                  {queueSearching ? '...' : 'go'}
                </button>
              </div>
            </div>

            {/* Search results (shown when there's a query) */}
            {queueSearchQuery.trim() &&
            (queueSearchLocalMatches.length > 0 || queueSearchYTResults.length > 0) ? (
              <div className="flex-1 overflow-y-auto px-3 py-1">
                {/* Playlist matches */}
                {queueSearchLocalMatches.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1 mt-1">
                      from your playlists
                    </div>

                    {queueSearchLocalMatches.map(({ playlistName, track }) => (
                      <div
                        key={`local-${track.id}`}
                        className="flex items-center gap-2 py-1.5 border-b border-white/[0.05] group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-mono text-white/90 truncate">
                            {track.title}
                          </div>

                          <div className="text-[10px] font-mono text-white/40 truncate">
                            {playlistName}
                            {track.duration > 0 && ` · ${formatDuration(track.duration)}`}
                          </div>
                        </div>

                        <button
                          onClick={() => handleAddLocalTrackToQueue(track)}
                          className={`text-[12px] font-mono px-2 py-1 border rounded transition-colors flex-shrink-0 ${
                            recentlyAdded.has(`qlocal-${track.id}`)
                              ? 'bg-green-500/20 border-green-500/30 text-green-400 opacity-100'
                              : 'bg-green-500/15 border-green-500/25 text-green-400 hover:bg-green-500/25 opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          {recentlyAdded.has(`qlocal-${track.id}`) ? '✓' : '+'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* YouTube results */}
                {queueSearchYTResults.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1 mt-1">
                      from youtube
                    </div>

                    {queueSearchYTResults.map((result) => (
                      <div
                        key={`yt-${result.videoId}`}
                        className="flex items-center gap-2 py-1.5 border-b border-white/[0.05] group"
                      >
                        {result.thumbnail && (
                          <img
                            src={result.thumbnail}
                            alt=""
                            className="w-10 h-7 rounded object-cover flex-shrink-0"
                          />
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-mono text-white/90 truncate">
                            {result.title}
                          </div>

                          {result.duration ? (
                            <div className="text-[10px] font-mono text-white/50">
                              {formatDuration(result.duration)}
                            </div>
                          ) : null}
                        </div>

                        <button
                          onClick={() => handleAddSearchResultToQueue(result)}
                          className={`text-[12px] font-mono px-2 py-1 border rounded transition-colors flex-shrink-0 ${
                            recentlyAdded.has(`qsearch-${result.videoId}`)
                              ? 'bg-green-500/20 border-green-500/30 text-green-400 opacity-100'
                              : 'bg-green-500/15 border-green-500/25 text-green-400 hover:bg-green-500/25 opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          {recentlyAdded.has(`qsearch-${result.videoId}`) ? '✓' : '+'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {queueSearching && (
                  <p className="text-white/40 text-[12px] font-mono text-center mt-2">
                    searching youtube...
                  </p>
                )}
              </div>
            ) : (
              /* Queue track list (default view) */
              <div className="flex-1 overflow-y-auto px-3 py-2">
                {queuePlaylist.length === 0 && (
                  <p className="text-white/40 text-[12px] font-mono mt-2">
                    no tracks — use the search bar above to add tracks
                  </p>
                )}

                {queuePlaylist.map((track, i) => {
                  // First unplayed track is "now playing" when music is active
                  const firstUnplayedIdx = queuePlaylist.findIndex((t) => !t.played)
                  const isNowPlaying = isCurrentDJ && stream.isPlaying && i === firstUnplayedIdx
                  const isLocked = track.played || isNowPlaying

                  return (
                    <div
                      key={track.id}
                      draggable={!isLocked}
                      onDragStart={(e) => {
                        if (isLocked) {
                          e.preventDefault()
                          return
                        }
                        dragSrc.current = i
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragOver={(e) => {
                        if (isLocked) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        setDragOverIdx(i)
                      }}
                      onDragLeave={() => setDragOverIdx(null)}
                      onDrop={(e) => {
                        e.preventDefault()
                        const from = dragSrc.current
                        if (from !== null && from !== i && !isLocked) {
                          useBoothStore.getState().reorderQueueTrack(from, i)
                          getNetwork().reorderQueuePlaylist(from, i)
                        }
                        dragSrc.current = null
                        setDragOverIdx(null)
                      }}
                      onDragEnd={() => {
                        dragSrc.current = null
                        setDragOverIdx(null)
                      }}
                      className={`flex items-center justify-between py-1 ${
                        track.played ? 'opacity-40' : ''
                      } ${isNowPlaying ? 'opacity-70' : ''} ${
                        !isLocked ? 'cursor-grab active:cursor-grabbing' : ''
                      } ${
                        dragOverIdx === i && !isLocked
                          ? 'border-b border-purple-400/60 bg-purple-500/10'
                          : ''
                      }`}
                    >
                      {/* Drag handle or lock indicator */}
                      {!isLocked ? (
                        <span className="text-[10px] text-white/40 mr-1.5 flex-shrink-0 select-none">
                          ⠿
                        </span>
                      ) : (
                        <span className="w-[14px] mr-1.5 flex-shrink-0" />
                      )}

                      <div className="text-[12px] font-mono text-white/90 truncate flex-1 mr-2">
                        {i + 1}. {track.title}
                        {isNowPlaying && <span className="text-green-400/60 ml-1">♪</span>}
                      </div>

                      {!track.played && (
                        <button
                          onClick={() => handleRemoveQueueTrack(track.id)}
                          className="text-[12px] text-white/50 hover:text-red-400 transition-colors flex-shrink-0"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          myPlaylistsContent
        )}
      </div>
    )
  }

  // ==========================================
  // NOT AT BOOTH: My Playlists (list or detail)
  // ==========================================
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.15]">
        <span className="text-base font-mono text-white/90">my playlists</span>

        <button
          onClick={() => useUIStore.getState().setPlaylistOpen(false)}
          className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition-colors rounded hover:bg-white/10"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {myPlaylistsContent}
    </div>
  )
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]!
  }

  return null
}

function extractThumbnail(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>
    if (typeof obj.url === 'string') return obj.url
    if (
      typeof obj.thumbnails === 'object' &&
      Array.isArray(obj.thumbnails) &&
      obj.thumbnails[0]?.url
    ) {
      return obj.thumbnails[0].url as string
    }
  }
  return ''
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60

  return `${m}:${s.toString().padStart(2, '0')}`
}

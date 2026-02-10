import { useState, useCallback } from 'react'

import { getNetwork } from '../network/NetworkManager'
import { useBoothStore } from '../stores/boothStore'
import { useGameStore } from '../stores/gameStore'
import { useUIStore } from '../stores/uiStore'
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
type PlaylistDetailTab = 'tracks' | 'search' | 'link'

export function PlaylistPanel() {
  const isConnected = useBoothStore((s) => s.isConnected)
  const isInQueue = useBoothStore((s) => s.isInQueue)
  const djQueue = useBoothStore((s) => s.djQueue)
  const currentDjSessionId = useBoothStore((s) => s.currentDjSessionId)
  const queuePlaylist = useBoothStore((s) => s.queuePlaylist)
  const mySessionId = useGameStore((s) => s.mySessionId)

  const playlists = usePlaylistStore((s) => s.playlists)
  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId)

  const isCurrentDJ = currentDjSessionId === mySessionId
  const myQueuePos = djQueue.findIndex((e) => e.sessionId === mySessionId) + 1

  // Tabs
  const [boothTab, setBoothTab] = useState<BoothTab>('queue')

  // Playlist navigation
  const [viewingPlaylistId, setViewingPlaylistId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<PlaylistDetailTab>('tracks')

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [linkInput, setLinkInput] = useState('')

  // Playlist management
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [creating, setCreating] = useState(false)

  const viewingPlaylist = playlists.find((p) => p.id === viewingPlaylistId) ?? null

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
    },
    [viewingPlaylistId, activePlaylistId]
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

    setLinkInput('')
  }, [linkInput, viewingPlaylistId, activePlaylistId])

  const handleCreatePlaylist = () => {
    const name = newPlaylistName.trim()
    if (!name) return

    usePlaylistStore.getState().createPlaylist(name)
    setNewPlaylistName('')
    setCreating(false)
  }

  // Add a single track from playlist to DJ queue
  const handleAddTrackToQueue = (track: PlaylistTrack) => {
    getNetwork().addToQueuePlaylist(track.title, track.link, track.duration)
  }

  // Add all tracks from a playlist to DJ queue
  const handleAddAllToQueue = (playlistId: string) => {
    const pl = playlists.find((p) => p.id === playlistId)
    if (!pl) return

    for (const track of pl.items) {
      getNetwork().addToQueuePlaylist(track.title, track.link, track.duration)
    }
  }

  const handleRemoveQueueTrack = useCallback((id: string) => {
    getNetwork().removeFromQueuePlaylist(id)
  }, [])

  // ---------- Playlist Detail View (Tracks / Search / Link sub-tabs) ----------

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
          className="text-[9px] font-mono text-white/40 hover:text-white flex items-center gap-1 flex-shrink-0"
        >
          ← Back
        </button>

        <span className="text-[11px] font-mono text-white/80 truncate flex-1 text-center">
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
            className={`flex-1 py-1.5 text-[10px] font-mono text-center transition-colors ${
              detailTab === t
                ? 'text-purple-300 border-b-2 border-purple-400'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            {t === 'tracks' ? 'Tracks' : t === 'search' ? 'Search' : 'Link'}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {detailTab === 'tracks' ? (
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {isConnected && viewingPlaylist.items.length > 0 && (
            <button
              onClick={() => handleAddAllToQueue(viewingPlaylist.id)}
              className="mb-2 w-full py-1 text-[9px] font-mono bg-green-500/15 border border-green-500/25 rounded text-green-400 hover:bg-green-500/25 transition-colors"
            >
              + add all to queue
            </button>
          )}

          {viewingPlaylist.items.length === 0 && (
            <p className="text-white/20 text-[10px] font-mono text-center mt-4">
              no tracks yet — use Search or Link tabs to add
            </p>
          )}

          {viewingPlaylist.items.map((track) => (
            <div
              key={track.id}
              className="flex items-center py-1.5 border-b border-white/[0.05] group"
            >
              <div className="flex-1 min-w-0 mr-2">
                <div className="text-[10px] font-mono text-white/70 truncate">{track.title}</div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {track.duration > 0 && (
                  <span className="text-[9px] font-mono text-white/30 mr-1">
                    {formatDuration(track.duration)}
                  </span>
                )}

                <button
                  onClick={() =>
                    usePlaylistStore.getState().removeTrack(viewingPlaylist.id, track.id)
                  }
                  className="w-5 h-5 flex items-center justify-center text-[10px] text-white/25 hover:text-red-400 transition-colors"
                  title="Delete track"
                >
                  🗑
                </button>

                {isConnected && (
                  <button
                    onClick={() => handleAddTrackToQueue(track)}
                    className="w-5 h-5 flex items-center justify-center text-[11px] text-white/25 hover:text-green-400 transition-colors"
                    title="Add to DJ queue"
                  >
                    +
                  </button>
                )}
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
                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none font-mono"
              />

              <button
                onClick={handleSearch}
                disabled={searching}
                className="px-2 py-1 text-[9px] font-mono bg-white/10 border border-white/20 rounded text-white/60 hover:text-white transition-colors disabled:opacity-30"
              >
                {searching ? '...' : 'go'}
              </button>
            </div>
          </div>

          <div className="px-3 py-1 border-b border-white/[0.06]">
            <span className="text-[8px] font-mono text-white/25">
              adding to: {viewingPlaylist.name}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-1">
            {searchResults.length === 0 && !searching && (
              <p className="text-white/20 text-[10px] font-mono text-center mt-4">
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
                  <div className="text-[10px] font-mono text-white/70 truncate">{result.title}</div>

                  {result.duration ? (
                    <div className="text-[8px] font-mono text-white/30">
                      {formatDuration(result.duration)}
                    </div>
                  ) : null}
                </div>

                <button
                  onClick={() => handleAddFromSearch(result)}
                  className="text-[9px] font-mono px-1.5 py-0.5 bg-purple-500/20 border border-purple-500/30 rounded text-purple-400 hover:bg-purple-500/30 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                >
                  +
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
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none font-mono"
            />

            <button
              onClick={handleAddLink}
              className="px-2 py-1 text-[9px] font-mono bg-purple-500/20 border border-purple-500/30 rounded text-purple-400 hover:bg-purple-500/30 transition-colors"
            >
              add
            </button>
          </div>

          <p className="text-white/20 text-[10px] font-mono mt-3">
            paste a YouTube URL to add it to{' '}
            <span className="text-white/40">{viewingPlaylist.name}</span>
          </p>
        </div>
      )}
    </div>
  ) : null

  // ---------- Playlist List View ----------

  const playlistListView = (
    <div className="flex-1 overflow-y-auto px-3 py-2">
      {playlists.length === 0 && !creating && (
        <p className="text-white/20 text-[10px] font-mono text-center mt-4">
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
            <div className="text-[10px] font-mono text-white/70">{pl.name}</div>

            <div className="text-[8px] font-mono text-white/30">
              {pl.items.length} track{pl.items.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="flex gap-1 flex-shrink-0">
            {isConnected && pl.items.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleAddAllToQueue(pl.id)
                }}
                className="text-[8px] font-mono px-1 py-0.5 text-green-400/60 hover:text-green-400 transition-colors opacity-0 group-hover:opacity-100"
              >
                +all
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation()
                usePlaylistStore.getState().removePlaylist(pl.id)
              }}
              className="text-[9px] text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
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
            className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none font-mono"
            autoFocus
          />

          <button
            onClick={handleCreatePlaylist}
            className="px-2 py-1 text-[9px] font-mono bg-purple-500/20 border border-purple-500/30 rounded text-purple-400 hover:bg-purple-500/30 transition-colors"
          >
            create
          </button>

          <button
            onClick={() => {
              setCreating(false)
              setNewPlaylistName('')
            }}
            className="px-1.5 py-1 text-[9px] font-mono text-white/30 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="mt-2 w-full py-1.5 text-[9px] font-mono text-white/30 hover:text-white/60 border border-dashed border-white/10 hover:border-white/20 rounded transition-colors"
        >
          + new playlist
        </button>
      )}
    </div>
  )

  // ---------- My Playlists content (list or detail) ----------

  const myPlaylistsContent =
    viewingPlaylistId && viewingPlaylist ? playlistDetailView : playlistListView

  // ---------- Layout ----------

  // When at booth: DJ booth header + 2 tabs (DJ Queue / My Playlists)
  if (isConnected) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.15]">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-mono text-white/80">dj booth</span>

            {isInQueue && (
              <span className="text-[10px] font-mono text-green-400">
                {isCurrentDJ ? '● you are the dj' : `● queue ${myQueuePos}/${djQueue.length}`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => useUIStore.getState().setPlaylistMinimized(true)}
              className="text-[10px] font-mono px-1.5 py-0.5 text-white/30 hover:text-white transition-colors"
              title="Minimize panel"
            >
              ▾
            </button>

            <button
              onClick={leaveBooth}
              className="text-[10px] font-mono px-2 py-0.5 bg-red-500/15 border border-red-500/30 rounded text-red-400 hover:bg-red-500/30 transition-colors"
            >
              leave booth
            </button>
          </div>
        </div>

        {/* DJ controls */}
        {isCurrentDJ && (
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/[0.1]">
            <button
              onClick={() => getNetwork().djPlay()}
              className="px-2.5 py-1 text-[9px] font-mono bg-green-500/20 border border-green-500/30 rounded text-green-400 hover:bg-green-500/30 transition-colors"
            >
              ▶ play
            </button>

            <button
              onClick={() => getNetwork().djStop()}
              className="px-2.5 py-1 text-[9px] font-mono bg-red-500/20 border border-red-500/30 rounded text-red-400 hover:bg-red-500/30 transition-colors"
            >
              ■ stop
            </button>

            <button
              onClick={() => getNetwork().djSkipTurn()}
              className="px-2.5 py-1 text-[9px] font-mono bg-white/10 border border-white/20 rounded text-white/60 hover:text-white transition-colors"
            >
              skip turn
            </button>
          </div>
        )}

        {/* 2 tabs: DJ Queue / My Playlists */}
        <div className="flex border-b border-white/[0.15]">
          {(['queue', 'playlists'] as BoothTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setBoothTab(t)}
              className={`flex-1 py-1.5 text-[10px] font-mono text-center transition-colors ${
                boothTab === t
                  ? 'text-purple-300 border-b-2 border-purple-400'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {t === 'queue' ? 'DJ Queue' : 'My Playlists'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {boothTab === 'queue' ? (
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {djQueue.length > 0 && (
              <div className="mb-3">
                <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider mb-1">
                  dj rotation
                </div>

                {djQueue.map((entry, i) => (
                  <div
                    key={entry.sessionId}
                    className={`flex items-center gap-2 py-1 ${
                      entry.sessionId === currentDjSessionId ? 'text-green-400' : 'text-white/60'
                    }`}
                  >
                    <span className="text-[10px] font-mono w-4">{i + 1}.</span>

                    <span className="text-[10px] font-mono truncate">
                      {entry.name}
                      {entry.sessionId === mySessionId && ' (you)'}
                    </span>

                    {entry.sessionId === currentDjSessionId && (
                      <span className="text-[8px] font-mono text-green-400/60 ml-auto">DJ</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider mb-1">
              my queue ({queuePlaylist.filter((t) => !t.played).length} tracks)
            </div>

            {queuePlaylist.length === 0 && (
              <p className="text-white/20 text-[10px] font-mono mt-2">
                no tracks — go to My Playlists to add tracks
              </p>
            )}

            {queuePlaylist.map((track, i) => (
              <div
                key={track.id}
                className={`flex items-center justify-between py-1 ${track.played ? 'opacity-40' : ''}`}
              >
                <div className="text-[10px] font-mono text-white/70 truncate flex-1 mr-2">
                  {i + 1}. {track.title}
                </div>

                {!track.played && (
                  <button
                    onClick={() => handleRemoveQueueTrack(track.id)}
                    className="text-[9px] text-white/30 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          myPlaylistsContent
        )}
      </div>
    )
  }

  // When NOT at booth: My Playlists (list or detail)
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.15]">
        <span className="text-[13px] font-mono text-white/80">my playlists</span>

        <button
          onClick={() => useUIStore.getState().setPlaylistOpen(false)}
          className="text-[10px] font-mono text-white/40 hover:text-white transition-colors"
        >
          ✕
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

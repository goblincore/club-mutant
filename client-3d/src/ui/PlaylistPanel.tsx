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
  getNetwork().leaveDJQueue()
  getNetwork().disconnectFromBooth()
  useUIStore.getState().setPlaylistOpen(false)
}

type BoothTab = 'queue' | 'playlists' | 'search'
type BrowseTab = 'playlists' | 'search'

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
  const [browseTab, setBrowseTab] = useState<BrowseTab>('playlists')

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [linkInput, setLinkInput] = useState('')

  // Playlist management
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [creating, setCreating] = useState(false)
  const [viewingPlaylistId, setViewingPlaylistId] = useState<string | null>(null)

  const activePlaylist = playlists.find((p) => p.id === (viewingPlaylistId ?? activePlaylistId))

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

  // Add search result to DJ queue (at booth) or to active playlist (browsing)
  const handleAddFromSearch = useCallback(
    (result: SearchResult) => {
      const link = `https://www.youtube.com/watch?v=${result.videoId}`

      if (isConnected) {
        getNetwork().addToQueuePlaylist(result.title, link, result.duration ?? 0)
      } else {
        const targetId = viewingPlaylistId ?? activePlaylistId
        if (!targetId) return

        usePlaylistStore.getState().addTrack(targetId, {
          id: crypto.randomUUID(),
          title: result.title,
          link,
          duration: result.duration ?? 0,
        })
      }
    },
    [isConnected, viewingPlaylistId, activePlaylistId]
  )

  const handleAddLink = useCallback(() => {
    const url = linkInput.trim()
    if (!url) return

    const videoId = extractVideoId(url)
    if (!videoId) return

    const link = `https://www.youtube.com/watch?v=${videoId}`

    if (isConnected) {
      getNetwork().addToQueuePlaylist('YouTube Video', link, 0)
    } else {
      const targetId = viewingPlaylistId ?? activePlaylistId
      if (!targetId) return

      usePlaylistStore.getState().addTrack(targetId, {
        id: crypto.randomUUID(),
        title: 'YouTube Video',
        link,
        duration: 0,
      })
    }

    setLinkInput('')
  }, [linkInput, isConnected, viewingPlaylistId, activePlaylistId])

  const handleCreatePlaylist = () => {
    const name = newPlaylistName.trim()
    if (!name) return

    usePlaylistStore.getState().createPlaylist(name)
    setNewPlaylistName('')
    setCreating(false)
  }

  // Add a single track from My Playlists to DJ queue
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

  // ---------- Shared sub-components ----------

  const searchContent = (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search */}
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
            {searching ? '...' : 'search'}
          </button>
        </div>
      </div>

      {/* Link paste */}
      <div className="px-3 py-2 border-b border-white/[0.1]">
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
            className="px-2 py-1 text-[9px] font-mono bg-white/10 border border-white/20 rounded text-white/60 hover:text-white transition-colors"
          >
            add
          </button>
        </div>
      </div>

      {/* Where tracks go */}
      {!isConnected && playlists.length > 0 && (
        <div className="px-3 py-1 border-b border-white/[0.06]">
          <span className="text-[8px] font-mono text-white/25">
            adding to: {activePlaylist?.name ?? 'select a playlist'}
          </span>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 py-1">
        {searchResults.length === 0 && !searching && (
          <p className="text-white/20 text-[10px] font-mono text-center mt-4">
            {isConnected
              ? 'search for tracks to add to your queue'
              : 'search for tracks to add to your playlist'}
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
  )

  const playlistsContent = (
    <div className="flex-1 overflow-y-auto px-3 py-2">
      {/* Viewing a specific playlist's tracks */}
      {viewingPlaylistId && activePlaylist ? (
        <>
          <button
            onClick={() => setViewingPlaylistId(null)}
            className="text-[9px] font-mono text-white/40 hover:text-white mb-2 flex items-center gap-1"
          >
            ← back to playlists
          </button>

          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-white/80">{activePlaylist.name}</span>

            {isConnected && activePlaylist.items.length > 0 && (
              <button
                onClick={() => handleAddAllToQueue(activePlaylist.id)}
                className="text-[8px] font-mono px-1.5 py-0.5 bg-green-500/20 border border-green-500/30 rounded text-green-400 hover:bg-green-500/30 transition-colors"
              >
                add all to queue
              </button>
            )}
          </div>

          {activePlaylist.items.length === 0 && (
            <p className="text-white/20 text-[10px] font-mono mt-2">
              empty playlist — use Search & Add to add tracks
            </p>
          )}

          {activePlaylist.items.map((track, i) => (
            <div key={track.id} className="flex items-center justify-between py-1 group">
              <div className="text-[10px] font-mono text-white/70 truncate flex-1 mr-2">
                {i + 1}. {track.title}
              </div>

              <div className="flex gap-1 flex-shrink-0">
                {isConnected && (
                  <button
                    onClick={() => handleAddTrackToQueue(track)}
                    className="text-[8px] font-mono text-green-400/60 hover:text-green-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="Add to DJ queue"
                  >
                    +queue
                  </button>
                )}

                <button
                  onClick={() =>
                    usePlaylistStore.getState().removeTrack(activePlaylist.id, track.id)
                  }
                  className="text-[9px] text-white/30 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          {/* Playlist list */}
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
        </>
      )}
    </div>
  )

  // ---------- Layout ----------

  // When at booth: DJ booth header + 3 tabs
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

        {/* Tabs */}
        <div className="flex border-b border-white/[0.15]">
          {(['queue', 'playlists', 'search'] as BoothTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setBoothTab(t)}
              className={`flex-1 py-1.5 text-[10px] font-mono text-center transition-colors ${
                boothTab === t
                  ? 'text-purple-300 border-b-2 border-purple-400'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {t === 'queue' ? 'DJ Queue' : t === 'playlists' ? 'My Playlists' : 'Search & Add'}
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
                no tracks — use My Playlists or Search & Add
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
        ) : boothTab === 'playlists' ? (
          playlistsContent
        ) : (
          searchContent
        )}
      </div>
    )
  }

  // When NOT at booth: simple My Playlists manager
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

      {/* Tabs */}
      <div className="flex border-b border-white/[0.15]">
        {(['playlists', 'search'] as BrowseTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setBrowseTab(t)}
            className={`flex-1 py-1.5 text-[10px] font-mono text-center transition-colors ${
              browseTab === t
                ? 'text-purple-300 border-b-2 border-purple-400'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            {t === 'playlists' ? 'My Playlists' : 'Search & Add'}
          </button>
        ))}
      </div>

      {browseTab === 'playlists' ? playlistsContent : searchContent}
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

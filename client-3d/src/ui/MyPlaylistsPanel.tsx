import { useState, useCallback, useRef } from 'react'

import { getNetwork } from '../network/NetworkManager'
import { useToastStore } from '../stores/toastStore'
import { useGameStore } from '../stores/gameStore'
import { useJukeboxStore } from '../stores/jukeboxStore'
import { usePlaylistStore, type PlaylistTrack } from '../stores/playlistStore'

interface SearchResult {
  title: string
  videoId: string
  duration?: number
  thumbnail?: string
}

type PlaylistDetailTab = 'tracks' | 'search' | 'link'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
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

export function MyPlaylistsPanel() {
  const musicMode = useGameStore((s) => s.musicMode)
  const mySessionId = useGameStore((s) => s.mySessionId)
  const jukeboxOccupantId = useJukeboxStore((s) => s.occupantId)
  const isJukeboxMode = musicMode === 'jukebox' || musicMode === 'personal'
  const canAddToQueue = !isJukeboxMode || jukeboxOccupantId === mySessionId
  const queueLabel = isJukeboxMode ? 'jukebox' : 'dj queue'

  const playlists = usePlaylistStore((s) => s.playlists)
  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId)

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

  const dragSrc = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

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

  const playlistDetailView = viewingPlaylist ? (
    <div className="flex-1 flex flex-col overflow-hidden max-h-full">
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
        <div className="w-10 flex-shrink-0" />
      </div>

      <div className="flex border-b border-white/[0.15]">
        {(['tracks', 'search', 'link'] as PlaylistDetailTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setDetailTab(t)}
            className={`flex-1 py-1 text-[13px] font-mono text-center transition-colors ${
              detailTab === t
                ? 'text-purple-300 border-b-2 border-purple-400'
                : 'text-white/60 hover:text-white/80'
            }`}
          >
            {t === 'tracks' ? 'Tracks' : t === 'search' ? 'Search' : 'Link'}
          </button>
        ))}
      </div>

      {detailTab === 'tracks' ? (
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {canAddToQueue && viewingPlaylist.items.length > 0 && (
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
                  ✕
                </button>
                {canAddToQueue && (
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
                className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1 text-[12px] text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none font-mono"
              />
              <button
                onClick={handleSearch}
                disabled={searching}
                className="px-2.5 py-1 text-[12px] font-mono bg-white/10 border border-white/20 rounded text-white/80 hover:text-white transition-colors disabled:opacity-30"
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
        <div className="flex-1 flex flex-col px-3 py-3">
          <div className="flex gap-1">
            <input
              type="text"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
              placeholder="paste youtube link..."
              className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1 text-[13px] text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none font-mono"
            />
            <button
              onClick={handleAddLink}
              className="px-2.5 py-1 text-[13px] font-mono bg-purple-500/20 border border-purple-500/30 rounded text-purple-400 hover:bg-purple-500/30 transition-colors"
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
          className="flex items-center justify-between py-1 border-b border-white/[0.05] group cursor-pointer hover:bg-white/[0.03] rounded px-1 -mx-1"
          onClick={() => {
            setViewingPlaylistId(pl.id)
            setDetailTab('tracks')
            usePlaylistStore.getState().setActivePlaylist(pl.id)
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-mono text-white/90">{pl.name}</div>
            <div className="text-[11px] font-mono text-white/50">
              {pl.items.length} track{pl.items.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {canAddToQueue && pl.items.length > 0 && (
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
              className="px-1 text-[12px] text-white/40 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      {creating ? (
        <div className="flex gap-1 mt-2">
          <input
            type="text"
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
            placeholder="playlist name..."
            className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1 text-[13px] text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none font-mono"
            autoFocus
          />
          <button
            onClick={handleCreatePlaylist}
            className="px-2.5 py-1 text-[13px] font-mono bg-purple-500/20 border border-purple-500/30 rounded text-purple-400 hover:bg-purple-500/30 transition-colors"
          >
            create
          </button>
          <button
            onClick={() => {
              setCreating(false)
              setNewPlaylistName('')
            }}
            className="px-2 py-1 text-[13px] font-mono text-white/50 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="mt-2 w-full py-1 text-[12px] font-mono text-white/50 hover:text-white/80 border border-dashed border-white/10 hover:border-white/20 rounded transition-colors"
        >
          + new playlist
        </button>
      )}
    </div>
  )

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent">
      {viewingPlaylistId && viewingPlaylist ? playlistDetailView : playlistListView}
    </div>
  )
}

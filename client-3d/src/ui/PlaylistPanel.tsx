import { useState, useCallback } from 'react'

import { getNetwork } from '../network/NetworkManager'
import { useBoothStore } from '../stores/boothStore'
import { useGameStore } from '../stores/gameStore'
import { useUIStore } from '../stores/uiStore'

interface SearchResult {
  title: string
  videoId: string
  duration?: number
  thumbnail?: string
}

export function PlaylistPanel() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [linkInput, setLinkInput] = useState('')

  const isInQueue = useBoothStore((s) => s.isInQueue)
  const isConnected = useBoothStore((s) => s.isConnected)
  const djQueue = useBoothStore((s) => s.djQueue)
  const currentDjSessionId = useBoothStore((s) => s.currentDjSessionId)
  const queuePlaylist = useBoothStore((s) => s.queuePlaylist)
  const mySessionId = useGameStore((s) => s.mySessionId)

  const isCurrentDJ = currentDjSessionId === mySessionId

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
          thumbnail: r.thumbnail ?? r.Thumbnail ?? '',
        }))
      )
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setSearching(false)
    }
  }, [searchQuery])

  const handleAddTrack = useCallback((result: SearchResult) => {
    const link = `https://www.youtube.com/watch?v=${result.videoId}`
    getNetwork().addToQueuePlaylist(result.title, link, result.duration ?? 0)
  }, [])

  const handleAddLink = useCallback(() => {
    const url = linkInput.trim()
    if (!url) return

    const videoId = extractVideoId(url)
    if (!videoId) return

    const link = `https://www.youtube.com/watch?v=${videoId}`
    getNetwork().addToQueuePlaylist('YouTube Video', link, 0)
    setLinkInput('')
  }, [linkInput])

  const handleRemoveTrack = useCallback((id: string) => {
    getNetwork().removeFromQueuePlaylist(id)
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.15]">
        <span className="text-[13px] font-mono text-white/80">playlist</span>

        <button
          onClick={useUIStore.getState().togglePlaylist}
          className="text-[10px] font-mono text-white/40 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {/* DJ Queue status */}
      <div className="px-3 py-2 border-b border-white/[0.1]">
        {isInQueue ? (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-green-400">
              {isCurrentDJ ? '● you are the dj' : `● in queue (${djQueue.findIndex((e) => e.sessionId === mySessionId) + 1}/${djQueue.length})`}
            </span>

            <div className="flex gap-1">
              {isCurrentDJ && (
                <>
                  <button
                    onClick={() => getNetwork().djPlay()}
                    className="px-2 py-0.5 text-[9px] font-mono bg-green-500/20 border border-green-500/30 rounded text-green-400 hover:bg-green-500/30 transition-colors"
                  >
                    play
                  </button>

                  <button
                    onClick={() => getNetwork().djStop()}
                    className="px-2 py-0.5 text-[9px] font-mono bg-red-500/20 border border-red-500/30 rounded text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    stop
                  </button>

                  <button
                    onClick={() => getNetwork().djSkipTurn()}
                    className="px-2 py-0.5 text-[9px] font-mono bg-white/10 border border-white/20 rounded text-white/60 hover:text-white transition-colors"
                  >
                    skip
                  </button>
                </>
              )}

              <button
                onClick={() => {
                  getNetwork().leaveDJQueue()
                  getNetwork().disconnectFromBooth()
                }}
                className="px-2 py-0.5 text-[9px] font-mono bg-white/10 border border-white/20 rounded text-white/60 hover:text-white transition-colors"
              >
                leave
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-white/40">
              {isConnected ? 'at the booth' : 'walk to booth + press R'}
            </span>

            {isConnected && (
              <button
                onClick={() => getNetwork().joinDJQueue()}
                className="px-2 py-0.5 text-[9px] font-mono bg-purple-500/20 border border-purple-500/30 rounded text-purple-400 hover:bg-purple-500/30 transition-colors"
              >
                join queue
              </button>
            )}
          </div>
        )}
      </div>

      {/* Queue playlist */}
      {isInQueue && queuePlaylist.length > 0 && (
        <div className="px-3 py-2 border-b border-white/[0.1] max-h-[200px] overflow-y-auto">
          <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider mb-1">
            my queue ({queuePlaylist.filter((t) => !t.played).length} tracks)
          </div>

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
                  onClick={() => handleRemoveTrack(track.id)}
                  className="text-[9px] text-white/30 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

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

      {/* Search results */}
      <div className="flex-1 overflow-y-auto px-3 py-1">
        {searchResults.length === 0 && !searching && (
          <p className="text-white/20 text-[10px] font-mono text-center mt-4">
            search for tracks to add
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
              <div className="text-[10px] font-mono text-white/70 truncate">
                {result.title}
              </div>

              {result.duration ? (
                <div className="text-[8px] font-mono text-white/30">
                  {formatDuration(result.duration)}
                </div>
              ) : null}
            </div>

            <button
              onClick={() => handleAddTrack(result)}
              className="text-[9px] font-mono px-1.5 py-0.5 bg-purple-500/20 border border-purple-500/30 rounded text-purple-400 hover:bg-purple-500/30 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
            >
              +
            </button>
          </div>
        ))}
      </div>
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60

  return `${m}:${s.toString().padStart(2, '0')}`
}

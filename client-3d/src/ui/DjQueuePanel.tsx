import { useState, useCallback } from 'react'

import { getNetwork } from '../network/NetworkManager'
import { useToastStore } from '../stores/toastStore'
import { useBoothStore } from '../stores/boothStore'
import { useGameStore } from '../stores/gameStore'
import { useMusicStore } from '../stores/musicStore'
import { useUIStore } from '../stores/uiStore'
import { useJukeboxStore } from '../stores/jukeboxStore'

interface SearchResult {
  title: string
  videoId: string
  duration?: number
  thumbnail?: string
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
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

export function DjQueuePanel() {
  const isConnected = useBoothStore((s) => s.isConnected)
  const djQueue = useBoothStore((s) => s.djQueue)
  const currentDjSessionId = useBoothStore((s) => s.currentDjSessionId)
  const queuePlaylist = useBoothStore((s) => s.queuePlaylist)
  const mySessionId = useGameStore((s) => s.mySessionId)
  const musicMode = useGameStore((s) => s.musicMode)
  const stream = useMusicStore((s) => s.stream)
  const jukeboxPlaylist = useJukeboxStore((s) => s.playlist)
  const jukeboxOccupantId = useJukeboxStore((s) => s.occupantId)
  const jukeboxOccupantName = useJukeboxStore((s) => s.occupantName)

  const isCurrentDJ = currentDjSessionId === mySessionId
  const myQueuePos = djQueue.findIndex((e) => e.sessionId === mySessionId) + 1
  const isJukeboxMode = musicMode === 'jukebox' || musicMode === 'personal'
  const isJukeboxOccupant = isJukeboxMode && jukeboxOccupantId === mySessionId

  const [queueSearchQuery, setQueueSearchQuery] = useState('')
  const [queueSearchYTResults, setQueueSearchYTResults] = useState<SearchResult[]>([])
  const [queueSearching, setQueueSearching] = useState(false)

  const [jbSearchQuery, setJbSearchQuery] = useState('')
  const [jbSearchYTResults, setJbSearchYTResults] = useState<SearchResult[]>([])
  const [jbSearching, setJbSearching] = useState(false)

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

  const handleAddSearchResultToJukebox = useCallback(
    (result: SearchResult) => {
      const link = `https://www.youtube.com/watch?v=${result.videoId}`
      getNetwork().addToJukebox(result.title, link, result.duration ?? 0)
      markAdded(`jbsearch-${result.videoId}`)
      useToastStore.getState().addToast('added to jukebox')
    },
    [markAdded]
  )

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

  const handleAddSearchResultToQueue = useCallback(
    (result: SearchResult) => {
      const link = `https://www.youtube.com/watch?v=${result.videoId}`
      getNetwork().addToQueuePlaylist(result.title, link, result.duration ?? 0)
      markAdded(`qsearch-${result.videoId}`)
      useToastStore.getState().addToast('added to dj queue')
    },
    [markAdded]
  )

  const handleRemoveQueueTrack = useCallback((id: string) => {
    getNetwork().removeFromQueuePlaylist(id)
  }, [])

  const handleRemoveJukeboxTrack = useCallback((id: string) => {
    getNetwork().removeFromJukebox(id)
  }, [])

  function leaveBooth() {
    getNetwork().disconnectFromBooth()
    getNetwork().leaveDJQueue()
    useUIStore.getState().setDjQueueOpen(false)
  }

  function leaveJukebox() {
    getNetwork().jukeboxDisconnect()
    useUIStore.getState().setDjQueueOpen(false)
  }

  // JUKEBOX / PERSONAL MODE
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
            onClick={() => {
              if (isJukeboxOccupant && musicMode !== 'personal') getNetwork().jukeboxDisconnect()
              useUIStore.getState().setDjQueueOpen(false)
            }}
            className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition-colors rounded hover:bg-white/10 flex-shrink-0"
            title="Close panel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Occupant status + now playing mini player */}
        <div className="px-3 py-2 border-b border-white/[0.1] bg-white/[0.02]">
          {/* Occupant status */}
          {jukeboxOccupantId && (
            <div className="text-[11px] font-mono mb-1">
              {isJukeboxOccupant ? (
                <span className="text-green-400">● you are using the {musicMode === 'personal' ? 'boombox' : 'jukebox'}</span>
              ) : (
                <span className="text-amber-400">● {jukeboxOccupantName} is using the {musicMode === 'personal' ? 'boombox' : 'jukebox'}</span>
              )}
            </div>
          )}

          {/* Now playing + controls */}
          {jukeboxPlaylist.length > 0 && (
            stream.isPlaying ? (
              <div className="flex items-center gap-2">
                {/* Playback controls — occupant only */}
                {isJukeboxOccupant && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => getNetwork().jukeboxStop()}
                      className="w-7 h-7 flex items-center justify-center bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded transition-colors"
                      title="Stop"
                    >
                      <span className="text-[12px] text-red-400">■</span>
                    </button>
                    <button
                      onClick={() => getNetwork().jukeboxSkip()}
                      className="w-7 h-7 flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/15 rounded transition-colors"
                      title="Skip to next"
                    >
                      <span className="text-[12px] text-white/90">▶▶</span>
                    </button>
                  </div>
                )}
                {/* Track info */}
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-mono text-white truncate">
                    {stream.currentTitle ?? '♪ untitled'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {isJukeboxOccupant && (
                  <button
                    onClick={() => getNetwork().jukeboxPlay()}
                    className="w-7 h-7 flex items-center justify-center bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded transition-colors"
                    title="Play"
                  >
                    <span className="text-[12px] text-green-400">▶</span>
                  </button>
                )}
                <span className="text-[13px] font-mono text-white/60">
                  stopped — {isJukeboxOccupant ? 'press ▶ to play' : `${jukeboxPlaylist.length} tracks queued`}
                </span>
              </div>
            )
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Jukebox search bar — only shown to occupant */}
          {isJukeboxOccupant && (
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
          )}

          {/* Search results — only when occupant is searching */}
          {isJukeboxOccupant && jbSearchQuery.trim() && jbSearchYTResults.length > 0 ? (
            <div className="flex-1 overflow-y-auto px-3 py-1">
              <div className="mb-2">
                <div className="text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1 mt-1">
                  from youtube
                </div>
                {jbSearchYTResults.map((result) => (
                  <div key={`yt-${result.videoId}`} className="flex items-center gap-2 py-1.5 border-b border-white/[0.05] group">
                    {result.thumbnail && (
                      <img src={result.thumbnail} alt="" className="w-10 h-7 rounded object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-mono text-white/90 truncate">{result.title}</div>
                      {result.duration ? (
                        <div className="text-[10px] font-mono text-white/50">{formatDuration(result.duration)}</div>
                      ) : null}
                    </div>
                    <button
                      onClick={() => handleAddSearchResultToJukebox(result)}
                      className={`text-[12px] font-mono px-2 py-1 border rounded transition-colors flex-shrink-0 ${
                        recentlyAdded.has(`jbsearch-${result.videoId}`) ? 'bg-green-500/20 border-green-500/30 text-green-400 opacity-100' : 'bg-green-500/15 border-green-500/25 text-green-400 hover:bg-green-500/25 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {recentlyAdded.has(`jbsearch-${result.videoId}`) ? '✓' : '+'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Jukebox track list (visible to everyone, but controls only for occupant) */
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {jukeboxPlaylist.length === 0 && (
                <div className="text-white/40 text-[12px] font-mono mt-2 text-center">
                  {isJukeboxOccupant ? (
                    <>
                      <p>no tracks — use the search bar above to add tracks</p>
                      <button
                        onClick={() => {
                          useUIStore.getState().setRightPanelTab('playlist')
                        }}
                        className="mt-2 text-purple-400 hover:text-purple-300 transition-colors underline underline-offset-2"
                      >
                        or add from your playlists →
                      </button>
                    </>
                  ) : (
                    <p>no tracks in the {musicMode === 'personal' ? 'boombox' : 'jukebox'} yet</p>
                  )}
                </div>
              )}
              {jukeboxPlaylist.map((track, i) => {
                const isNowPlaying = i === 0 && stream.isPlaying

                return (
                  <div key={track.id} className={`flex items-center justify-between py-1 ${isNowPlaying ? 'bg-purple-500/10 rounded px-1 -mx-1' : ''}`}>
                    <div className="text-[12px] font-mono text-white/90 truncate flex-1 mr-2">
                      <span className="text-white/40 mr-1">{i + 1}.</span>
                      {track.title}
                      {isNowPlaying && <span className="text-green-400/60 ml-1">♪</span>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {track.duration > 0 && <span className="text-[10px] font-mono text-white/40">{formatDuration(track.duration)}</span>}
                      <span className="text-[10px] font-mono text-white/30 max-w-[60px] truncate">{track.addedByName}</span>
                      {isJukeboxOccupant && <button onClick={() => handleRemoveJukeboxTrack(track.id)} className="text-[12px] text-white/50 hover:text-red-400 transition-colors" title="Remove track">✕</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </div>
      </div>
    )
  }

  // AT BOOTH: normal DJ Queue mode
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.15]">
        <span className="text-[13px] font-mono text-purple-300 flex-1 truncate">
          ● dj queue {isConnected && djQueue.length > 0 && `(${djQueue.length})`}
        </span>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          {isConnected && (
            <button onClick={leaveBooth} className="w-7 h-7 flex items-center justify-center text-white/50 hover:text-red-400 transition-colors rounded hover:bg-white/10" title="Leave booth">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            </button>
          )}

          <button onClick={() => useUIStore.getState().setDjQueueMinimized(true)} className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition-colors rounded hover:bg-white/10" title="Minimize panel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Queue Status (Current DJ / Up Next) */}
        {!isConnected ? (
          <div className="px-3 py-6 flex flex-col items-center justify-center">
            <p className="text-white/60 text-[13px] font-mono mb-4 text-center">you are not connected to a booth.</p>
          </div>
        ) : (
          <>
            {/* Status indicator */}
            <div className="px-3 py-2 border-b border-white/[0.1] bg-white/[0.02]">
              <div className="flex justify-between items-center text-[11px] font-mono">
                <span className={isCurrentDJ ? 'text-green-400' : 'text-white/50'}>
                  {isCurrentDJ ? '● you are the DJ' : myQueuePos > 0 ? `your queue spot: #${myQueuePos}` : 'you are not in the queue'}
                </span>
                {djQueue.length > 0 && (
                  <span className="text-white/40">{djQueue[0]?.sessionId === mySessionId ? 'now playing' : `playing: ${djQueue[0]?.name}`}</span>
                )}
              </div>
            </div>

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
                  <button onClick={() => { setQueueSearchQuery(''); setQueueSearchYTResults([]); }} className="px-2 py-1.5 text-[12px] font-mono text-white/50 hover:text-white transition-colors" title="Clear search">✕</button>
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

            {/* Search results */}
            {queueSearchQuery.trim() && queueSearchYTResults.length > 0 ? (
              <div className="flex-1 overflow-y-auto px-3 py-1">
                <div className="text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1 mt-1">from youtube</div>
                {queueSearchYTResults.map((result) => (
                  <div key={`yt-${result.videoId}`} className="flex items-center gap-2 py-1.5 border-b border-white/[0.05] group">
                    {result.thumbnail && <img src={result.thumbnail} alt="" className="w-10 h-7 rounded object-cover flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-mono text-white/90 truncate">{result.title}</div>
                      {result.duration ? <div className="text-[10px] font-mono text-white/50">{formatDuration(result.duration)}</div> : null}
                    </div>
                    <button onClick={() => handleAddSearchResultToQueue(result)} className={`text-[12px] font-mono px-2 py-1 border rounded transition-colors flex-shrink-0 ${recentlyAdded.has(`qsearch-${result.videoId}`) ? 'bg-green-500/20 border-green-500/30 text-green-400 opacity-100' : 'bg-green-500/15 border-green-500/25 text-green-400 hover:bg-green-500/25 opacity-0 group-hover:opacity-100'}`}>
                      {recentlyAdded.has(`qsearch-${result.videoId}`) ? '✓' : '+'}
                    </button>
                  </div>
                ))}
                {queueSearching && <p className="text-white/40 text-[12px] font-mono text-center mt-2">searching youtube...</p>}
              </div>
            ) : (
              /* Queue track list */
              <div className="flex-1 overflow-y-auto px-3 py-2">
                {queuePlaylist.length === 0 && (
                  <p className="text-white/40 text-[12px] font-mono mt-2 text-center">
                    your queue is empty <br />
                    <span className="text-[10px] text-white/30">search above or add from My Playlists</span>
                  </p>
                )}
                {queuePlaylist.map((track, i) => {
                  const isNowPlaying = isCurrentDJ && i === 0 && stream.isPlaying

                  return (
                    <div key={track.id} className={`flex items-center justify-between py-1 ${isNowPlaying ? 'bg-purple-500/10 rounded px-1 -mx-1' : ''}`}>
                      <div className="text-[12px] font-mono text-white/90 truncate flex-1 mr-2">
                        <span className="text-white/40 mr-1">{i + 1}.</span>
                        {track.title}
                        {isNowPlaying && <span className="text-green-400/60 ml-1">♪</span>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {track.duration > 0 && <span className="text-[10px] font-mono text-white/40">{formatDuration(track.duration)}</span>}
                        <button onClick={() => handleRemoveQueueTrack(track.id)} className="text-[12px] text-white/50 hover:text-red-400 transition-colors" title="Remove track">✕</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useKonpyuuTA } from '../../context/KonpyuuTAContext'
import type { Playlist, PlaylistTrack } from '../../types'

type View = 'homepage' | 'playlists' | 'watch' | 'playlist-detail'

interface YouTubeVideo {
  id?: string
  videoId?: string
  title: string
  thumbnail?: string
  viewCount?: number
  publishedAt?: string
}

interface YouTubeSearchResult {
  videoId: string
  title: string
  thumbnail?: string
  viewCount?: number
  publishedAt?: string
}

interface Video {
  id: string
  title: string
  thumbnail?: string
  viewCount?: number
  publishedAt?: string
}

const ITEMS_PER_PAGE = 12

const WEIRD_TERMS = [
  '1996 local TV commercial',
  'forgotten VHS home video 1993',
  'obscure public access show 1998',
  'weird internet video 2002',
  'rare 90s cartoon pilot',
  'lost TV special 1995',
  'public access cable 1997',
  'strange music video 1994',
]

const CATEGORY_TERMS: Record<string, string[]> = {
  'home-videos': ['home video 1990', 'family VHS 1995', 'amateur recording 1998'],
  'music': ['music video 1994', 'live performance 1996', 'MTV underground'],
  'comedy': ['stand up 1995', 'comedy sketch 1990s', 'funny home video'],
  'tv-shows': ['90s TV show', 'pilot episode rare', 'public access TV'],
  'weird': ['weird video', 'strange footage', 'bizarre clip'],
  'vintage': ['vintage footage', 'old film', 'retro video'],
  'public-access': ['public access', 'cable access', 'community TV'],
  'corrupted': ['corrupted video', 'glitch footage', 'damaged VHS'],
}

function pickRandom(arr: string[], n: number): string[] {
  const copy = arr.slice()
  const result: string[] = []
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length)
    result.push(copy.splice(idx, 1)[0]!)
  }
  return result
}

function formatTimeAgo(dateString: string): string {
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diff < 60) return `${diff} SECONDS AGO`
    if (diff < 3600) return `${Math.floor(diff / 60)} MINUTES AGO`
    if (diff < 86400) return `${Math.floor(diff / 3600)} HOURS AGO`
    if (diff < 2592000) return `${Math.floor(diff / 86400)} DAYS AGO`
    if (diff < 31536000) return `${Math.floor(diff / 2592000)} MONTHS AGO`
    return `${Math.floor(diff / 31536000)} YEARS AGO`
  } catch {
    return 'UNKNOWN DATE'
  }
}

function extractYouTubeId(item: PlaylistTrack): string {
  if (item.id && /^[a-zA-Z0-9_-]{11}$/.test(item.id)) return item.id
  if (item.link) {
    const m = item.link.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
    if (m) return m[1]!
  }
  return item.id
}

export function MutantTube() {
  const { playlistService, env } = useKonpyuuTA()

  const [view, setView] = useState<View>('homepage')
  const [loading, setLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState('INITIALIZING ARCHIVE...')
  const [error, setError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [currentCategory, setCurrentCategory] = useState<string | null>(null)
  const [results, setResults] = useState<Video[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [currentPlaylist, setCurrentPlaylist] = useState<Playlist | null>(null)
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null)

  const [sidebarHidden, setSidebarHidden] = useState(false)
  const [statusText, setStatusText] = useState('Ready')

  const youtubeApiUrl = env.youtubeApiUrl

  const searchYouTube = useCallback(async (q: string, limit: number): Promise<YouTubeSearchResult[]> => {
    if (!youtubeApiUrl) throw new Error('YouTube API URL not configured')
    const res = await fetch(`${youtubeApiUrl}/search?q=${encodeURIComponent(q)}&limit=${limit}`)
    if (!res.ok) throw new Error(`YouTube search failed: ${res.status}`)
    const data = await res.json()
    const items = (data.items || []) as YouTubeVideo[]
    return items
      .filter((v) => v.id || v.videoId)
      .map((v) => ({
        videoId: (v.id ?? v.videoId) as string,
        title: v.title,
        thumbnail: v.thumbnail,
        viewCount: v.viewCount,
        publishedAt: v.publishedAt,
      }))
  }, [youtubeApiUrl])

  const loadHomepage = useCallback(async () => {
    setLoading(true)
    setLoadingMessage('SCANNING ARCHIVES...')
    setStatusText('Retrieving data fragments...')
    setError(null)

    try {
      const terms = pickRandom(WEIRD_TERMS, 3)
      setStatusText(`Querying: ${terms[0]!.substring(0, 20)}...`)

      const searchResults = await Promise.all(terms.map(t => searchYouTube(t, 8)))
      const seen = new Set<string>()
      const all: Video[] = []

      searchResults.forEach(results => {
        results.forEach(v => {
          if (v.videoId && !seen.has(v.videoId)) {
            seen.add(v.videoId)
            all.push({
              id: v.videoId,
              title: v.title,
              thumbnail: v.thumbnail,
              viewCount: v.viewCount,
              publishedAt: v.publishedAt,
            })
          }
        })
      })

      all.sort((a, b) => (a.viewCount || 0) - (b.viewCount || 0))
      setResults(all)
      setCurrentPage(1)
      setTotalPages(Math.ceil(all.length / ITEMS_PER_PAGE))
      setLoading(false)
      setStatusText(`${all.length} fragments recovered`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLoading(false)
    }
  }, [searchYouTube])

  const loadCategory = useCallback(async (category: string, categoryName: string) => {
    setLoading(true)
    setLoadingMessage('DECRYPTING ARCHIVE...')
    setStatusText('Decrypting category data...')
    setError(null)
    setCurrentCategory(category)
    setSearchQuery('')
    setSidebarHidden(false)

    try {
      const terms = CATEGORY_TERMS[category] || WEIRD_TERMS
      const selectedTerms = pickRandom(terms, 2)
      const searchResults = await Promise.all(selectedTerms.map(t => searchYouTube(t, 15)))

      const seen = new Set<string>()
      const all: Video[] = []

      searchResults.forEach(results => {
        results.forEach(v => {
          if (v.videoId && !seen.has(v.videoId)) {
            seen.add(v.videoId)
            all.push({
              id: v.videoId,
              title: v.title,
              thumbnail: v.thumbnail,
              viewCount: v.viewCount,
              publishedAt: v.publishedAt,
            })
          }
        })
      })

      all.sort((a, b) => (a.viewCount || 0) - (b.viewCount || 0))
      setResults(all)
      setCurrentPage(1)
      setTotalPages(Math.ceil(all.length / ITEMS_PER_PAGE))
      setLoading(false)
      setStatusText(`${all.length} fragments in ${categoryName}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLoading(false)
    }
  }, [searchYouTube])

  const doSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return

    setLoading(true)
    setLoadingMessage('EXECUTING SEARCH QUERY...')
    setStatusText('Executing search query...')
    setError(null)
    setCurrentCategory(null)
    setSidebarHidden(true)

    try {
      const searchResults = await searchYouTube(q, 50)
      const videos: Video[] = searchResults.map(v => ({
        id: v.videoId,
        title: v.title,
        thumbnail: v.thumbnail,
        viewCount: v.viewCount,
        publishedAt: v.publishedAt,
      }))

      setResults(videos)
      setCurrentPage(1)
      setTotalPages(Math.ceil(videos.length / ITEMS_PER_PAGE))
      setLoading(false)
      setStatusText(`Scan complete: ${videos.length} matches`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLoading(false)
    }
  }, [searchQuery, searchYouTube])

  const loadPlaylists = useCallback(async () => {
    if (!playlistService) return

    setLoading(true)
    setLoadingMessage('ACCESSING PLAYLIST DATABASE...')
    setStatusText('Connecting to storage...')
    setError(null)

    try {
      await playlistService.loadFromServer()
      const lists = playlistService.getPlaylists()
      setPlaylists(lists)
      setLoading(false)
      setStatusText(`${lists.length} archives mounted`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLoading(false)
    }
  }, [playlistService])

  const createPlaylist = useCallback(async () => {
    if (!playlistService) return

    const name = window.prompt('Archive designation:')
    if (!name?.trim()) return

    setStatusText('Initializing archive...')
    try {
      playlistService.createPlaylist(name.trim())
      await loadPlaylists()
      setStatusText('Archive created')
    } catch (err) {
      alert(`Archive initialization failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setStatusText('Creation failed')
    }
  }, [playlistService, loadPlaylists])

  const deletePlaylist = useCallback(async (id: string) => {
    if (!playlistService) return
    if (!window.confirm('Permanently purge this archive?')) return

    setStatusText('Purging archive...')
    try {
      playlistService.removePlaylist(id)
      await loadPlaylists()
      setStatusText('Archive purged')
    } catch (err) {
      alert(`Purge failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setStatusText('Purge failed')
    }
  }, [playlistService, loadPlaylists])

  const openPlaylist = useCallback((pl: Playlist) => {
    setCurrentPlaylist(pl)
    setView('playlist-detail')
    setStatusText(`${pl.items.length} fragments in archive`)
  }, [])

  const removeFromPlaylist = useCallback(async (playlistId: string, videoId: string) => {
    if (!playlistService || !currentPlaylist) return

    setStatusText('Modifying archive...')
    try {
      playlistService.removeTrack(playlistId, videoId)
      const updated = { ...currentPlaylist, items: currentPlaylist.items.filter(v => v.id !== videoId) }
      setCurrentPlaylist(updated)
      setStatusText('Fragment removed')
    } catch (err) {
      alert(`Modification failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setStatusText('Operation failed')
    }
  }, [playlistService, currentPlaylist])

  const watchVideo = useCallback((video: Video) => {
    setCurrentVideo(video)
    setView('watch')
    setStatusText('SIGNAL ACQUIRED')
  }, [])

  const watchTrack = useCallback((track: PlaylistTrack) => {
    const ytId = extractYouTubeId(track)
    setCurrentVideo({
      id: ytId,
      title: track.title,
    })
    setView('watch')
    setStatusText('SIGNAL ACQUIRED')
  }, [])

  const addCurrentToPlaylist = useCallback(async () => {
    if (!currentVideo || !playlistService) return

    setStatusText('Processing...')

    try {
      const lists = playlistService.getPlaylists()

      if (lists.length === 0) {
        const createNew = window.confirm('No archives exist. Initialize new container?')
        if (!createNew) {
          setStatusText('Operation cancelled')
          return
        }

        const name = window.prompt('Archive designation:')
        if (!name?.trim()) {
          setStatusText('Operation cancelled')
          return
        }

        const newPl: Playlist = {
          id: crypto.randomUUID(),
          name: name.trim(),
          items: [{
            id: currentVideo.id,
            title: currentVideo.title,
            link: `https://www.youtube.com/watch?v=${currentVideo.id}`,
            duration: 0,
          }],
        }

        playlistService.createPlaylist(newPl.name)
        playlistService.addTrack(newPl.id, newPl.items[0]!)
        alert(`Fragment stored in "${name.trim()}"`)
        setStatusText('Stored successfully')
        return
      }

      const options = lists.map((pl, i) => `${i + 1}. ${pl.name}`).join('\n')
      const choice = window.prompt(`Select destination archive:\n${options}\n\nEnter number:`)

      if (!choice) {
        setStatusText('Operation cancelled')
        return
      }

      const idx = parseInt(choice, 10) - 1
      if (isNaN(idx) || idx < 0 || idx >= lists.length) {
        alert('Invalid selection.')
        setStatusText('Invalid selection')
        return
      }

      const pl = lists[idx]!
      const track: PlaylistTrack = {
        id: currentVideo.id,
        title: currentVideo.title,
        link: `https://www.youtube.com/watch?v=${currentVideo.id}`,
        duration: 0,
      }

      playlistService.addTrack(pl.id, track)
      alert(`Fragment stored in "${pl.name}"`)
      setStatusText('Stored successfully')
    } catch (err) {
      alert(`Storage failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setStatusText('Storage failed')
    }
  }, [currentVideo, playlistService])

  const goBack = useCallback(() => {
    if (view === 'watch') {
      if (currentPlaylist) {
        setView('playlist-detail')
      } else if (currentCategory) {
        setView('homepage')
      } else {
        setView('homepage')
      }
    } else if (view === 'playlist-detail') {
      setView('playlists')
      setCurrentPlaylist(null)
    }
  }, [view, currentPlaylist, currentCategory])

  const showView = useCallback((v: View) => {
    setView(v)
    if (v === 'homepage') {
      setCurrentCategory(null)
      setSearchQuery('')
      setSidebarHidden(false)
      loadHomepage()
    } else if (v === 'playlists') {
      setCurrentCategory(null)
      setSearchQuery('')
      setSidebarHidden(false)
      loadPlaylists()
    }
  }, [loadHomepage, loadPlaylists])

  useEffect(() => {
    loadHomepage()
  }, [loadHomepage])

  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return results.slice(start, start + ITEMS_PER_PAGE)
  }, [results, currentPage])

  const corruptionLevel = useMemo(() => Math.floor(Math.random() * 87 + 13), [])
  const signalStrength = useMemo(() => Math.floor(Math.random() * 40 + 60), [])
  const distortion = useMemo(() => (Math.random() * 15).toFixed(1), [])

  return (
    <div className="mt-root">
      {/* Header */}
      <div id="mt-header">
        <div className="logo">MUTANT</div>
        <form id="mt-search-form" onSubmit={doSearch}>
          <input
            id="mt-search-input"
            type="text"
            placeholder="SEARCH ARCHIVES..."
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" id="mt-search-btn">
            <span className="btn-skull">💀</span>
            <span>SEARCH</span>
          </button>
        </form>
        <div className="header-status">
          <div className="status-item">
            <div className="status-indicator" />
            <span>SYSTEM: ONLINE</span>
          </div>
          <div className="status-item">
            <span>INTEGRITY: 87%</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div id="mt-tabs">
        <button
          className={`mt-tab${view === 'homepage' || view === 'watch' ? ' active' : ''}`}
          onClick={() => showView('homepage')}
        >
          Home
        </button>
        <button
          className={`mt-tab${view === 'playlists' || view === 'playlist-detail' ? ' active' : ''}`}
          onClick={() => showView('playlists')}
        >
          Playlists
        </button>
      </div>

      {/* Main */}
      <div id="mt-main">
        {/* Sidebar */}
        <div id={`mt-sidebar${sidebarHidden ? ' hidden' : ''}`}>
          <h3>Directories</h3>
          {Object.entries(CATEGORY_TERMS).map(([key]) => (
            <div
              key={key}
              className={`directory-item${currentCategory === key ? ' active' : ''}`}
              onClick={() => loadCategory(key, key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}
            >
              {key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </div>
          ))}
        </div>

        {/* Content */}
        <div id="mt-content">
          {loading && (
            <div className="loading-container">
              <div className="loading-skull">💀</div>
              <div className="loading-text">DECRYPTING ARCHIVE</div>
              <div className="loading-progress">
                <div className="loading-progress-bar" />
              </div>
              <div className="loading-status">{loadingMessage}</div>
            </div>
          )}

          {error && (
            <div id="mt-error">Error: {error}</div>
          )}

          {!loading && !error && view === 'homepage' && (
            <>
              <div className="section-title">
                ⚠ FRAGMENTED SIGNALS DETECTED ⚠
              </div>
              {results.length === 0 ? (
                <div className="empty-state">
                  No signals detected.<br />Initialize manual search.
                </div>
              ) : (
                <>
                  <div className="mt-masonry">
                    {paginatedResults.map((v, i) => (
                      <div
                        key={v.id}
                        className="mt-video-card"
                        onClick={() => watchVideo(v)}
                      >
                        <div className="mt-thumb-container">
                          {v.thumbnail ? (
                            <img className="mt-thumb" src={v.thumbnail} alt="" loading="lazy" />
                          ) : (
                            <div className="mt-thumb-placeholder">▶</div>
                          )}
                        </div>
                        <div className="mt-video-info">
                          <div className="mt-video-title" data-index={i}>{v.title}</div>
                          <div className="mt-video-meta">
                            <span>{v.viewCount?.toLocaleString() ?? '???'}</span> VIEWS // {v.publishedAt ? formatTimeAgo(v.publishedAt) : 'UNKNOWN DATE'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="pagination">
                      <button
                        className="pagination-btn"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                      >
                        &lt; PREV
                      </button>
                      <div className="pagination-info">
                        PAGE <span>{currentPage}</span> / <span>{totalPages}</span> // {results.length} FRAGMENTS
                      </div>
                      <button
                        className="pagination-btn"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                      >
                        NEXT &gt;
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {!loading && !error && view === 'playlists' && (
            <>
              <div className="section-title">⚠ DATA ARCHIVES ⚠</div>
              <button className="mt-btn-new" onClick={createPlaylist}>
                + Initialize New Archive
              </button>
              {playlists.length === 0 ? (
                <div className="empty-state">
                  No archives found.<br />Create a new data container.
                </div>
              ) : (
                playlists.map(pl => (
                  <div
                    key={pl.id}
                    className="mt-playlist-item"
                    onClick={() => openPlaylist(pl)}
                  >
                    <div className="mt-playlist-info">
                      <div className="mt-playlist-name">[ {pl.name} ]</div>
                      <div className="mt-playlist-count">{pl.items.length} FRAGMENTS STORED</div>
                    </div>
                    <button
                      className="mt-btn-delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        deletePlaylist(pl.id)
                      }}
                    >
                      PURGE
                    </button>
                  </div>
                ))
              )}
            </>
          )}

          {!loading && !error && view === 'playlist-detail' && currentPlaylist && (
            <>
              <button className="mt-btn-back" onClick={goBack}>
                ← RETURN TO ARCHIVES
              </button>
              <div className="section-title">ARCHIVE: [ {currentPlaylist.name} ]</div>
              {currentPlaylist.items.length === 0 ? (
                <div className="empty-state">
                  Empty archive.<br />Consume media to populate.
                </div>
              ) : (
                currentPlaylist.items.map(v => {
                  const ytId = extractYouTubeId(v)
                  return (
                    <div
                      key={v.id}
                      className="mt-track-item"
                      onClick={() => watchTrack(v)}
                    >
                      <span className="mt-track-title">▶ {v.title || ytId}</span>
                      <button
                        className="mt-btn-delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFromPlaylist(currentPlaylist.id, v.id)
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  )
                })
              )}
            </>
          )}

          {!loading && !error && view === 'watch' && currentVideo && (
            <div id="mt-watch">
              <button className="back-btn" onClick={goBack}>
                ← RETURN TO ARCHIVE
              </button>
              <div id="mt-watch-frame-container">
                <div className="corner-decoration corner-tl" />
                <div className="corner-decoration corner-tr" />
                <div className="corner-decoration corner-bl" />
                <div className="corner-decoration corner-br" />
                <div className="video-warning">⚠ LIVE FEED</div>
                <div className="video-scanlines" />
                <iframe
                  id="mt-watch-frame"
                  src={`https://www.youtube-nocookie.com/embed/${currentVideo.id}?autoplay=1`}
                  allowFullScreen
                />
              </div>
              <div id="mt-watch-info">
                <div id="mt-watch-title">&gt; {currentVideo.title}</div>
                <div className="video-stats">
                  <div className="stat-item">
                    <div className="stat-label">Signal Strength</div>
                    <div className="stat-value">{signalStrength}%</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label">Data Corruption</div>
                    <div className="stat-value">{corruptionLevel}%</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label">Distortion</div>
                    <div className="stat-value">{distortion}dB</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label">Source</div>
                    <div className="stat-value">EXTERNAL</div>
                  </div>
                </div>
                <div id="mt-watch-actions">
                  <button className="action-btn primary" onClick={addCurrentToPlaylist}>
                    💀 STORE TO ARCHIVE
                  </button>
                  <button
                    className="action-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(`https://youtube.com/watch?v=${currentVideo.id}`)
                      alert('Link copied to clipboard')
                    }}
                  >
                    📋 COPY LINK
                  </button>
                </div>
              </div>
              <div className="glitch-decoration" style={{ top: '20%', left: '5%' }}>
                ERR_{Math.floor(Math.random() * 999)}
              </div>
              <div className="glitch-decoration" style={{ top: '60%', right: '8%', animationDelay: '1s' }}>
                SIG_LOSS
              </div>
              <div className="glitch-decoration" style={{ bottom: '30%', left: '10%', animationDelay: '2s' }}>
                ◈ DATA ◈
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div id="mt-status-bar">
        <div className="status-text">{statusText}</div>
        <div className="equalizer">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="eq-bar" />
          ))}
        </div>
      </div>
    </div>
  )
}

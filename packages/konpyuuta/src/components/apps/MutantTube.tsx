import { useState, useEffect, useCallback, useMemo } from 'react'
import { useKonpyuuTA } from '../../context/KonpyuuTAContext'
import type { Playlist, PlaylistTrack } from '../../types'
import { usePopup } from './MutantTubePopup'

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
  const popup = usePopup()

  const [view, setView] = useState<View>('homepage')
  const [loading, setLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState('INITIALIZING...')
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
    setLoadingMessage('LOADING...')
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
    setLoadingMessage('LOADING...')
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
      setStatusText(`${lists.length} playlists loaded`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLoading(false)
    }
  }, [playlistService])

  const createPlaylist = useCallback(async () => {
    if (!playlistService) return

    const name = await popup.prompt('Enter playlist name:', '', 'Playlist name...', 'Create Playlist')
    if (!name?.trim()) return

    setStatusText('Creating playlist...')
    try {
      playlistService.createPlaylist(name.trim())
      await loadPlaylists()
      setStatusText('Playlist created')
    } catch (err) {
      await popup.alert(`Failed to create playlist: ${err instanceof Error ? err.message : 'Unknown error'}`, 'Error')
      setStatusText('Creation failed')
    }
  }, [playlistService, loadPlaylists, popup])

  const deletePlaylist = useCallback(async (id: string) => {
    if (!playlistService) return
    const confirmed = await popup.confirm('Delete this playlist?', 'Confirm Delete')
    if (!confirmed) return

    setStatusText('Deleting playlist...')
    try {
      playlistService.removePlaylist(id)
      await loadPlaylists()
      setStatusText('Playlist deleted')
    } catch (err) {
      await popup.alert(`Failed to delete playlist: ${err instanceof Error ? err.message : 'Unknown error'}`, 'Error')
      setStatusText('Delete failed')
    }
  }, [playlistService, loadPlaylists, popup])

  const openPlaylist = useCallback((pl: Playlist) => {
    setCurrentPlaylist(pl)
    setView('playlist-detail')
    setStatusText(`${pl.items.length} videos in playlist`)
    // Lazily-listed playlists carry only metadata until opened.
    if (pl.itemsLoaded === false && playlistService?.ensureItemsLoaded) {
      playlistService
        .ensureItemsLoaded(pl.id)
        .then(() => {
          const fresh = playlistService.getPlaylists().find((p) => p.id === pl.id)
          if (fresh) {
            setCurrentPlaylist(fresh)
            setPlaylists(playlistService.getPlaylists())
            setStatusText(`${fresh.items.length} videos in playlist`)
          }
        })
        .catch(() => setStatusText('Failed to load playlist tracks'))
    }
  }, [playlistService])

  // Local copy of the playlist-URL parser (konpyuuta cannot import from
  // client-3d; cf. extractYouTubeId above). Rejects mixes (RD*) and
  // auth-required lists (WL/LL), which cannot be fetched anonymously.
  const extractPlaylistId = useCallback((input: string): string | null => {
    const trimmed = input.trim()
    if (!trimmed) return null
    const idRegex = /^[A-Za-z0-9_-]{10,64}$/
    const importable = (id: string) =>
      idRegex.test(id) && id !== 'WL' && id !== 'LL' && !id.startsWith('RD')
    if (idRegex.test(trimmed) && trimmed.length !== 11) {
      return importable(trimmed) ? trimmed : null
    }
    try {
      const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
      const hosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']
      if (!hosts.includes(url.hostname)) return null
      const list = url.searchParams.get('list')
      return list && importable(list) ? list : null
    } catch {
      return null
    }
  }, [])

  const importFromYouTube = useCallback(async () => {
    if (!playlistService?.importPlaylist) return

    const input = await popup.prompt(
      'Paste a YouTube playlist URL:',
      '',
      'https://www.youtube.com/playlist?list=...',
      'Import From YouTube'
    )
    if (!input?.trim()) return

    const playlistId = extractPlaylistId(input)
    if (!playlistId) {
      await popup.alert('Invalid playlist URL. Mixes and private lists cannot be imported.', 'Error')
      return
    }

    setLoading(true)
    setLoadingMessage('SIPHONING PLAYLIST DATA...')
    setStatusText('Contacting the tube...')
    try {
      const res = await fetch(`${youtubeApiUrl}/playlist/${encodeURIComponent(playlistId)}`)
      if (res.status === 404) throw new Error('Playlist not found (is it public?)')
      if (res.status === 400) throw new Error('This playlist type cannot be imported')
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`)
      const data: {
        title: string
        items: { videoId: string; title: string; duration: number; thumbnail?: string }[]
        declaredCount: number
        truncated: boolean
      } = await res.json()

      const items = data.items ?? []
      if (items.length === 0) throw new Error('Playlist is empty or unavailable')

      const tracks: PlaylistTrack[] = items.map((it) => ({
        id: crypto.randomUUID(),
        title: it.title,
        link: `https://www.youtube.com/watch?v=${it.videoId}`,
        duration: it.duration,
        thumbnail: it.thumbnail,
      }))
      playlistService.importPlaylist(data.title || 'YouTube Playlist', tracks)
      await loadPlaylists()

      const total = data.declaredCount > tracks.length ? data.declaredCount : tracks.length
      const summary = data.truncated
        ? `Imported first ${tracks.length} of ${total} fragments.`
        : `Imported ${tracks.length} fragments.`
      setStatusText(summary)
      await popup.alert(summary, 'Import Complete')
    } catch (err) {
      setLoading(false)
      setStatusText('Import failed')
      await popup.alert(
        `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'Error'
      )
    }
  }, [playlistService, popup, youtubeApiUrl, extractPlaylistId, loadPlaylists])

  const removeFromPlaylist = useCallback(async (playlistId: string, videoId: string) => {
    if (!playlistService || !currentPlaylist) return

    setStatusText('Removing from playlist...')
    try {
      playlistService.removeTrack(playlistId, videoId)
      const updated = { ...currentPlaylist, items: currentPlaylist.items.filter(v => v.id !== videoId) }
      setCurrentPlaylist(updated)
      setStatusText('Removed from playlist')
    } catch (err) {
      await popup.alert(`Failed to remove: ${err instanceof Error ? err.message : 'Unknown error'}`, 'Error')
      setStatusText('Operation failed')
    }
  }, [playlistService, currentPlaylist, popup])

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
        const createNew = await popup.confirm('No playlists exist. Create a new one?', 'Add to Playlist')
        if (!createNew) {
          setStatusText('Operation cancelled')
          return
        }

        const name = await popup.prompt('Enter playlist name:', '', 'Playlist name...', 'Create Playlist')
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
        await popup.alert(`Added to "${name.trim()}"`, 'Success')
        setStatusText('Added to playlist')
        return
      }

      const options = lists.map((pl) => ({ label: pl.name, value: pl.id }))
      const selectedId = await popup.select('Select playlist:', options, lists[0]!.id, 'Add to Playlist')

      if (!selectedId) {
        setStatusText('Operation cancelled')
        return
      }

      const pl = lists.find((l) => l.id === selectedId)
      if (!pl) {
        await popup.alert('Invalid selection.', 'Error')
        setStatusText('Invalid selection')
        return
      }

      const track: PlaylistTrack = {
        id: currentVideo.id,
        title: currentVideo.title,
        link: `https://www.youtube.com/watch?v=${currentVideo.id}`,
        duration: 0,
      }

      playlistService.addTrack(pl.id, track)
      await popup.alert(`Added to "${pl.name}"`, 'Success')
      setStatusText('Added to playlist')
    } catch (err) {
      await popup.alert(`Failed to add: ${err instanceof Error ? err.message : 'Unknown error'}`, 'Error')
      setStatusText('Add failed')
    }
  }, [currentVideo, playlistService, popup])

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
      {popup.PopupComponent}
      {/* Header */}
      <div id="mt-header">
        <div className="logo"></div>
        <form id="mt-search-form" onSubmit={doSearch}>
          <input
            id="mt-search-input"
            type="text"
            placeholder="SEARCH VIDEOS..."
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" id="mt-search-btn">
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
              <div className="loading-pulse">◈</div>
              <div className="loading-text">LOADING</div>
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
              <div className="section-title">⚠ PLAYLISTS ⚠</div>
              <button className="mt-btn-new" onClick={createPlaylist}>
                + Create Playlist
              </button>
              {playlistService?.importPlaylist && (
                <button className="mt-btn-new" onClick={importFromYouTube}>
                  ⇩ Import From YouTube
                </button>
              )}
              {playlists.length === 0 ? (
                <div className="empty-state">
                  No playlists found.<br />Create a new playlist.
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
                      <div className="mt-playlist-count">
                        {(pl.itemsLoaded === false ? pl.trackCount ?? 0 : pl.items.length)} FRAGMENTS STORED
                      </div>
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
                ← RETURN TO PLAYLISTS
              </button>
              <div className="section-title">PLAYLIST: [ {currentPlaylist.name} ]</div>
              {currentPlaylist.items.length === 0 ? (
                <div className="empty-state">
                  Empty playlist.<br />Add videos to populate.
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
                ← RETURN
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
                    ADD TO PLAYLIST
                  </button>
                  <button
                    className="action-btn"
                    onClick={async () => {
                      navigator.clipboard.writeText(`https://youtube.com/watch?v=${currentVideo.id}`)
                      await popup.alert('Link copied to clipboard', 'Copied')
                    }}
                  >
                    COPY LINK
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

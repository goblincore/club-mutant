import { SignalTransition } from './SignalTransition'
import { useState, useEffect, useCallback, useRef, useId } from 'react'
import { useKonpyuuTA } from '../../context/KonpyuuTAContext'
import type { Playlist, PlaylistTrack } from '../../types'
import {
  DISCOVERY_TERMS, TUBE_CATEGORIES, pickRandom, normalizeVideos, selectTinyVideos, normalizeDailyFeature, type DailyFeature, extractPlaylistId,
  videoFromTrack, durationSeconds, tubeRequest, type TubeVideo,
} from '../../lib/mutantTube'
import { SOCIAL_ICONS } from '../../lib/socialIcons'
import { usePopup } from './MutantTubePopup'
import { SignalOrgan } from './SignalOrgan'
import { TubeMascot } from './TubeMascot'
import { DoodleStar } from './AnalogAccents'
import { TinyTubesWordmark } from './TinyTubesWordmark'
import { PixelSymbol } from './PixelSymbol'

type View = 'browse' | 'playlists' | 'playlist' | 'watch'
type Browse = { kind: 'home' | 'search' | 'category'; title: string; query?: string; category?: string; under100: boolean }
const HOME: Browse = { kind: 'home', title: 'What’s on today?', under100: true }
const PAGE_SIZE = 12

function Thumbnail({ video }: { video: TubeVideo }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [video.id, video.thumbnail])
  return <div className="mt-thumbnail">
    {failed ? <span className="mt-thumbnail-fallback">▶</span> : <img
      src={video.thumbnail || `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
      alt="" loading="lazy" onError={() => setFailed(true)}
    />}
    {video.duration && <span className="mt-duration">{video.duration}</span>}
  </div>
}

export function MutantTube() {
  const { playlistService: service, env } = useKonpyuuTA()
  const popup = usePopup()
  const featureTitleId = useId()
  const [view, setView] = useState<View>('browse')
  const [browse, setBrowse] = useState<Browse>(HOME)
  const [query, setQuery] = useState('')
  const [videos, setVideos] = useState<TubeVideo[]>([])
  const [page, setPage] = useState(1)
  const [featured, setFeatured] = useState<DailyFeature | null>(null)
  const [featureLoading, setFeatureLoading] = useState(false)
  const [featureError, setFeatureError] = useState(false)
  const [featureRetry, setFeatureRetry] = useState(0)
  const [playlists, setPlaylists] = useState<Playlist[]>(() => service?.getPlaylists() ?? [])
  const [playlistId, setPlaylistId] = useState<string | null>(null)
  const [video, setVideo] = useState<TubeVideo | null>(null)
  const [trackId, setTrackId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [status, setStatus] = useState('Welcome to your little video corner.')
  const request = useRef<{ id: number; controller: AbortController }>({ id: 0, controller: new AbortController() })
  const mutation = useRef(false)
  const libraryLoad = useRef<Promise<void> | null>(null)
  const currentPlaylist = playlists.find((item) => item.id === playlistId)
  const pageCount = Math.max(1, Math.ceil(videos.length / PAGE_SIZE))
  const trackIndex = currentPlaylist?.items.findIndex((track) => track.id === trackId) ?? -1

  const refresh = useCallback(() => {
    setPlaylists(service?.getPlaylists() ?? [])
    setSyncError(service?.getSyncError?.() ?? null)
  }, [service])
  useEffect(() => {
    refresh()
    return service?.subscribe?.(refresh)
  }, [service, refresh])

  const ensureLibrary = async () => {
    if (!service) return
    // Fetch metadata once per app session; repeat reads can race pending
    // local saves/deletes. Store subscriptions keep edits current afterward.
    libraryLoad.current ??= service.loadFromServer()
    try {
      await libraryLoad.current
      refresh()
      if (service.getSyncError?.()) libraryLoad.current = null
    } catch (err) { libraryLoad.current = null; throw err }
  }

  const beginRequest = useCallback(() => {
    request.current.controller.abort()
    const next = { id: request.current.id + 1, controller: new AbortController() }
    request.current = next
    setError(null)
    setLoading(true)
    return next
  }, [])
  const cancelRequest = () => {
    request.current.controller.abort()
    request.current.id += 1
    setError(null)
    setLoading(false)
  }

  const loadBrowse = useCallback(async (next: Browse) => {
    const job = beginRequest()
    setView('browse')
    setBrowse(next)
    setPlaylistId(null)
    setTrackId(null)
    setPage(1)
    setStatus(next.kind === 'search' ? `Searching for “${next.query}”…` : 'Finding a few lovely little videos…')
    try {
      const terms = next.kind === 'search' ? [next.query!] : pickRandom(
        TUBE_CATEGORIES.find((category) => category.id === next.category)?.terms ?? DISCOVERY_TERMS,
        next.kind === 'home' ? 3 : 2,
      )
      const responses = await Promise.allSettled(terms.map(async (term) => {
        const data = await tubeRequest(env.youtubeApiUrl, `/search?q=${encodeURIComponent(term)}&limit=50${next.under100 ? '&maxViews=99' : ''}`, job.controller.signal) as { items?: unknown }
        if (!Array.isArray(data.items)) throw new Error('The video service returned an unexpected response. Please try again.')
        return normalizeVideos(data.items)
      }))
      if (request.current.id !== job.id) return
      const successful = responses.filter((result) => result.status === 'fulfilled')
      if (!successful.length) throw (responses[0] as PromiseRejectedResult).reason
      const seen = new Set<string>()
      const results = successful.flatMap((result) => result.value).filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })
      const selected = selectTinyVideos(results, next.under100)
      if (next.kind !== 'search' && !next.under100) selected.sort((a, b) => (a.viewCount ?? Infinity) - (b.viewCount ?? Infinity))
      setVideos(selected)
      setStatus(`${selected.length} videos found${next.under100 ? ' with fewer than 100 views' : ''}.${successful.length < responses.length ? ' Some shelves could not load; try refreshing.' : ''}`)
    } catch (err) {
      if (request.current.id === job.id) setError(err instanceof Error ? err.message : 'Could not load videos. Please try again.')
    } finally {
      if (request.current.id === job.id) setLoading(false)
    }
  }, [beginRequest, env.youtubeApiUrl])

  useEffect(() => {
    void loadBrowse(HOME)
    return () => { request.current.controller.abort(); request.current.id += 1 }
  }, [loadBrowse])

  useEffect(() => {
    if (view !== 'browse' || browse.kind !== 'home') return
    const controller = new AbortController()
    let running = false
    setFeatured(null)
    const loadFeature = async () => {
      if (running || controller.signal.aborted) return
      running = true
      setFeatureLoading(true)
      try {
        const data = await tubeRequest(env.youtubeApiUrl, '/featured', controller.signal)
        if (controller.signal.aborted) return
        setFeatured(normalizeDailyFeature(data))
        setFeatureError(false)
      } catch {
        if (!controller.signal.aborted) { setFeatured(null); setFeatureError(true) }
      } finally {
        running = false
        if (!controller.signal.aborted) setFeatureLoading(false)
      }
    }
    void loadFeature()
    // Recheck counts and the UTC date while Home remains open; no background
    // polling while another app view or a hidden browser tab is active.
    const timer = setInterval(() => { if (!document.hidden) void loadFeature() }, 60_000)
    const onVisible = () => { if (!document.hidden) void loadFeature() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [view, browse.kind, env.youtubeApiUrl, featureRetry])

  const showPlaylists = async () => {
    const job = beginRequest()
    setView('playlists')
    setPlaylistId(null)
    setStatus('Opening your video library…')
    try {
      await ensureLibrary()
      if (request.current.id !== job.id) return
      refresh()
      setStatus(service ? 'Your playlists are ready.' : 'Playlists are unavailable in this session.')
    } catch (err) {
      if (request.current.id === job.id) setError(err instanceof Error ? err.message : 'Could not load playlists.')
    } finally {
      if (request.current.id === job.id) setLoading(false)
    }
  }

  const openPlaylist = async (id: string) => {
    const job = beginRequest()
    setPlaylistId(id)
    setView('playlist')
    try {
      await service?.ensureItemsLoaded?.(id)
      if (request.current.id !== job.id) return
      refresh()
      const list = service?.getPlaylists().find((item) => item.id === id)
      if (!list) throw new Error('This playlist is no longer available.')
      if (list.itemsLoaded === false) throw new Error('Sign in to load this playlist’s videos.')
      setStatus(`${list.items.length} videos in “${list.name}”.`)
    } catch (err) {
      if (request.current.id === job.id) setError(err instanceof Error ? err.message : 'Could not load playlist videos.')
    } finally {
      if (request.current.id === job.id) setLoading(false)
    }
  }

  // Read playlist edits from the local store immediately. A server reload here
  // races its debounced save/delete and can restore old names or deleted lists.
  const mutate = async (operation: () => Promise<void> | void) => {
    if (mutation.current) return
    mutation.current = true
    setBusy(true)
    try { await operation(); refresh() }
    catch (err) { await popup.alert(err instanceof Error ? err.message : 'Something went wrong. Please try again.', 'Could not save') }
    finally { mutation.current = false; setBusy(false) }
  }

  const createPlaylist = () => mutate(async () => {
    if (!service) return
    const name = await popup.prompt('Give your new playlist a name.', '', 'e.g. Sunday afternoon', 'New playlist')
    if (!name?.trim()) return
    service.createPlaylist(name)
    setStatus('Playlist created. Find a video and choose Save to playlist.')
  })

  const importPlaylist = () => mutate(async () => {
    if (!service?.importPlaylist) return
    const input = await popup.prompt('Paste a public YouTube playlist URL. Up to 500 videos can be imported.', '', 'https://www.youtube.com/playlist?list=…', 'Import playlist')
    if (!input?.trim()) return
    const id = extractPlaylistId(input)
    if (!id) throw new Error('Use a public YouTube playlist URL or playlist ID. Mixes, Watch Later, and private playlists cannot be imported.')
    setStatus('Importing your playlist…')
    const data = await tubeRequest(env.youtubeApiUrl, `/playlist/${encodeURIComponent(id)}`) as {
      title?: string; items?: { videoId: string; title: string; duration: number; thumbnail?: string }[]; truncated?: boolean; declaredCount?: number
    }
    const items = Array.isArray(data.items) ? data.items : []
    const validItems = items.filter((item) => item && /^[\w-]{11}$/.test(item.videoId)).slice(0, 500)
    if (!validItems.length) throw new Error('This playlist is empty or unavailable. Check that it is public.')
    const tracks: PlaylistTrack[] = validItems.map((item) => ({
      id: crypto.randomUUID(), title: item.title || 'Untitled video',
      link: `https://www.youtube.com/watch?v=${item.videoId}`, duration: item.duration || 0, thumbnail: item.thumbnail,
    }))
    const newId = service.importPlaylist(data.title || 'YouTube playlist', tracks)
    refresh()
    await openPlaylist(newId)
    const partial = data.truncated || items.length > 500 || (data.declaredCount ?? 0) > tracks.length
    const message = partial
      ? `Imported ${tracks.length} available videos${data.declaredCount ? ` of ${data.declaredCount}` : ''}. Some videos may be unavailable; the import limit is 500.`
      : `Imported ${tracks.length} videos. Enjoy your new playlist!`
    setStatus(message)
    await popup.alert(message, 'Playlist imported')
  })

  const saveVideo = () => mutate(async () => {
    if (!service || !video) return
    await ensureLibrary()
    const lists = service.getPlaylists()
    const options = [...lists.map((list) => ({ label: list.name, value: list.id })), { label: '+ Create a new playlist', value: '__new__' }]
    let id = await popup.select('Where would you like to save this video?', options, lists[0]?.id ?? '__new__', 'Save to playlist')
    if (!id) return
    if (id === '__new__') {
      const name = await popup.prompt('Give your new playlist a name.', '', 'Playlist name', 'New playlist')
      if (!name?.trim()) return
      id = service.createPlaylist(name)
    }
    await service.ensureItemsLoaded?.(id)
    const list = service.getPlaylists().find((item) => item.id === id)
    if (!list || list.itemsLoaded === false) throw new Error('Could not load this playlist. Sign in and try again.')
    if (list.items.some((item) => videoFromTrack(item)?.id === video.id)) {
      setStatus(`Already saved in “${list.name}”.`)
      return
    }
    service.addTrack(id, {
      id: crypto.randomUUID(), title: video.title, link: `https://www.youtube.com/watch?v=${video.id}`,
      duration: durationSeconds(video.duration), thumbnail: video.thumbnail,
    })
    setStatus(`Saved to “${list.name}”.`)
  })

  const watch = (next: TubeVideo, track?: PlaylistTrack) => {
    cancelRequest()
    setVideo(next)
    setTrackId(track?.id ?? null)
    if (!track) setPlaylistId(null)
    setView('watch')
    setStatus('Now playing. Settle in!')
  }
  const watchTrack = (track: PlaylistTrack) => {
    const next = videoFromTrack(track)
    if (next) watch(next, track)
    else void popup.alert('This saved video does not have a valid YouTube link.', 'Video unavailable')
  }
  const back = () => {
    cancelRequest()
    if (playlistId) setView('playlist')
    else setView('browse')
  }

  return <div className="mt-root" aria-busy={loading || busy}>
    <SignalTransition selective enabled={!loading} trigger={`${view}:${browse.kind}:${browse.query || browse.category || ''}`} />
    {popup.PopupComponent}
    <header className="mt-header">
      <button className="mt-brand" onClick={() => void loadBrowse({ ...HOME, under100: browse.under100 })} disabled={busy} aria-label="TinyTubes home">
        <img className="mt-brand-toy" src={SOCIAL_ICONS.mutanttube} alt="" /><span><TinyTubesWordmark /><small>TRANSMISSIONS FROM THE OTHER SIDE</small></span>
      </button>
      <span className="mt-club-badge" aria-hidden="true">TT<br />CH. 01</span>
      <form className="mt-search" onSubmit={(event) => {
        event.preventDefault()
        if (query.trim() && !busy) void loadBrowse({ kind: 'search', query: query.trim(), title: `Results for “${query.trim()}”`, under100: browse.under100 })
      }}>
        <input aria-label="Search videos" placeholder="Search the signal…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button disabled={!query.trim() || busy}>Find ↗</button>
      </form>
    </header>
    <nav className="mt-nav" aria-label="Video library">
      <button aria-current={view === 'browse' && browse.kind === 'home' ? 'page' : undefined} onClick={() => { setQuery(''); void loadBrowse({ ...HOME, under100: browse.under100 }) }} disabled={busy}><PixelSymbol kind="home" /> Home</button>
      <button aria-current={view === 'playlists' || view === 'playlist' || (view === 'watch' && playlistId) ? 'page' : undefined} onClick={() => void showPlaylists()} disabled={busy}><PixelSymbol kind="tape" /> My playlists <span>{playlists.length}</span></button>
      <button className="mt-surprise" onClick={() => { setQuery(''); void loadBrowse({ ...HOME, title: 'Fresh finds, just for you', under100: browse.under100 }) }} disabled={busy}><PixelSymbol kind="shuffle" /> Surprise me</button>
      <button className="mt-audience" aria-pressed={browse.under100} title={browse.under100 ? 'Showing only videos with 0–99 views. Click to show all videos.' : 'Showing all videos. Click to show only videos with fewer than 100 views.'} disabled={busy} onClick={() => void loadBrowse({ ...browse, under100: !browse.under100 })}>{browse.under100 ? '✓ Under 100 views' : 'All videos'}</button>
    </nav>
    {syncError && <div className="mt-sync-note" role="status">Your playlists are saved on this device, but couldn’t sync online. Check your connection and reopen My playlists to retry.</div>}
    <div className="mt-layout">
      <aside className="mt-sidebar">
        <h2>CHOOSE A CHANNEL</h2>
        {TUBE_CATEGORIES.map((category, channelIndex) => <button key={category.id} disabled={busy}
          aria-current={view === 'browse' && browse.category === category.id ? 'page' : undefined}
          onClick={() => { setQuery(''); void loadBrowse({ kind: 'category', title: category.label, category: category.id, under100: browse.under100 }) }}>
          <span className="mt-channel-number" aria-hidden="true">{String(channelIndex + 1).padStart(2, '0')}</span>{category.label}
        </button>)}
        <div className="mt-sidebar-note"><div className="mt-shelf-toy" aria-hidden="true"><SignalOrgan compact /></div><div><p>Weak signal.<br />Deep reception.</p><small>FREQUENCY / 00.01</small></div></div>
      </aside>
      <main className="mt-content">
        {view === 'browse' && browse.kind === 'home' && <section className="mt-feature" aria-labelledby={featureTitleId}>
          <div className="mt-feature-kicker"><PixelSymbol kind="star" /><h2 id={featureTitleId}>Unpopular video of the day</h2><span>DAILY TRANSMISSION</span></div>
          {featured ? <button className="mt-feature-video" onClick={() => watch(featured.video)} disabled={busy} aria-label={`Watch today's featured video: ${featured.video.title}`}>
            <div className="mt-feature-screen"><Thumbnail video={featured.video} /><span className="mt-feature-play" aria-hidden="true">▶</span></div>
            <div className="mt-feature-info"><small>LOW VISIBILITY / HIGH RESONANCE</small><h3>{featured.video.title}</h3><p>{featured.video.channel || 'A little internet find'}</p><span className="mt-feature-views">{featured.video.viewCount} {featured.video.viewCount === 1 ? 'view' : 'views'} · fewer than 100</span><span className="mt-feature-watch">Watch today’s pick ↗</span><time dateTime={featured.checkedAt}>Checked {new Date(featured.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · changes daily at midnight UTC</time></div>
          </button> : <div className="mt-feature-status" role="status"><p>{featureLoading ? 'Tuning today’s low-visibility transmission…' : featureError ? 'We couldn’t check today’s pick. The other shelves are still here.' : 'No verified video under 100 views is available just now.'}</p>{!featureLoading && <button onClick={() => setFeatureRetry((value) => value + 1)}>Check again</button>}</div>}
        </section>}
        {loading ? <div className="mt-empty" role="status"><TubeMascot loading /><h2>Finding the good stuff…</h2><p>{browse.under100 ? 'Looking beyond the popular results for videos with 0–99 views.' : 'This may take a little moment.'}</p></div>
        : error ? <div className="mt-empty" role="alert"><span className="mt-empty-icon">☁</span><h2>Signal interrupted</h2><p>{error}</p><button onClick={() => void (view === 'playlist' && playlistId ? openPlaylist(playlistId) : view === 'playlists' ? showPlaylists() : loadBrowse(browse))}>Try again</button></div>
        : view === 'browse' ? <>
          <div className="mt-section-heading"><div><small>{browse.kind === 'home' ? 'TODAY’S PROGRAM GUIDE' : browse.kind === 'search' ? 'SEARCH RESULTS' : 'YOU’RE TUNED IN TO'}</small><h1 data-signal-text>{browse.title}</h1><p>{browse.kind === 'search' ? `${videos.length} videos found${browse.under100 ? ' with fewer than 100 views' : ''}` : browse.under100 ? 'Little-seen music, old tapes, and odd finds. Every video has fewer than 100 views.' : 'Music, old tapes, and odd little finds. See where the dial takes you.'}</p></div><span className="mt-finds-counter"><DoodleStar filled /><strong>{String(videos.length).padStart(2, '0')}</strong><small>FINDS</small></span></div>
          {!videos.length ? <div className="mt-empty"><h2>{browse.under100 ? 'No tiny finds this time' : 'No videos this time'}</h2><p>{browse.under100 ? 'None of the videos we checked had a known count below 100. Try another search or channel, or switch to All videos.' : 'Try another search or pick a different shelf.'}</p>{browse.under100 && <button onClick={() => void loadBrowse({ ...browse, under100: false })}>Show all videos</button>}</div> : <>
            <div className="mt-video-grid">{videos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((item, videoIndex) => <button className="mt-video-card" key={item.id} onClick={() => watch(item)}>
              <div className="mt-card-tuning" aria-hidden="true"><span>{String((page - 1) * PAGE_SIZE + videoIndex + 1).padStart(2, '0')}</span><i /><i /><i /></div><Thumbnail video={item} /><div className="mt-card-info"><h2>{item.title}</h2><p>{item.channel || 'A little internet find'}</p><small>{item.viewCount === undefined ? 'Views unavailable' : `${item.viewCount.toLocaleString()} views`}</small></div>
            </button>)}</div>
            {pageCount > 1 && <nav className="mt-pagination" aria-label="Results pages"><button disabled={page === 1} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page} of {pageCount}</span><button disabled={page === pageCount} onClick={() => setPage(page + 1)}>Next →</button></nav>}
          </>}
        </> : view === 'playlists' ? <>
          <div className="mt-section-heading"><div><small>COLLECT YOUR FAVORITES</small><h1 data-signal-text>My playlists</h1><p>A home for all your internet treasures.</p></div><span className="mt-heading-star" aria-hidden="true"><PixelSymbol kind="tape" /></span></div>
          <div className="mt-actions"><button className="mt-primary" disabled={!service || busy} onClick={createPlaylist}>+ New playlist</button>{service?.importPlaylist && <button disabled={busy} onClick={importPlaylist}>↓ Import from YouTube</button>}</div>
          {!playlists.length && <div className="mt-empty"><span className="mt-empty-icon" aria-hidden="true"><PixelSymbol kind="tape" /></span><h2>{service ? 'Your collection starts here' : 'Playlists are unavailable'}</h2><p>{service ? 'Create a playlist, then save videos as you explore. Or bring over a public YouTube playlist.' : 'Open TinyTubes from Club Mutant to use your library.'}</p></div>}
          <div className="mt-playlists">{playlists.map((list) => <div className="mt-playlist-row" key={list.id}>
            <button className="mt-playlist-open" onClick={() => void openPlaylist(list.id)} disabled={busy}><span className="mt-folder"><PixelSymbol kind="tape" /></span><span><strong>{list.name}</strong><small>{list.itemsLoaded === false ? list.trackCount ?? 0 : list.items.length} videos</small></span><span className="mt-row-arrow">→</span></button>
            <button className="mt-delete" aria-label={`Delete ${list.name}`} disabled={busy} onClick={() => void mutate(async () => { if (await popup.confirm(`Delete “${list.name}” and its saved videos?`, 'Delete playlist')) { service?.removePlaylist(list.id); setStatus('Playlist deleted.') } })}>Delete</button>
          </div>)}</div>
        </> : view === 'playlist' && currentPlaylist ? <>
          <button className="mt-back" onClick={() => { cancelRequest(); setView('playlists'); setPlaylistId(null) }}>← My playlists</button>
          <div className="mt-section-heading"><div><small>YOUR VIDEO COLLECTION</small><h1 data-signal-text>{currentPlaylist.name}</h1><p>{currentPlaylist.items.length} videos · saved for later, loved forever</p></div></div>
          <div className="mt-actions">
            <button className="mt-primary" disabled={!currentPlaylist.items.length || busy} onClick={() => watchTrack(currentPlaylist.items[0]!)}>▶ Play first video</button>
            {service?.renamePlaylist && <button disabled={busy} onClick={() => void mutate(async () => { const name = await popup.prompt('Choose a new name.', currentPlaylist.name, 'Playlist name', 'Rename playlist'); if (name?.trim()) { service.renamePlaylist?.(currentPlaylist.id, name); setStatus('Playlist renamed.') } })}>Rename</button>}
          </div>
          {!currentPlaylist.items.length && <div className="mt-empty"><h2>A blank mixtape</h2><p>Find a video, open it, and choose Save to playlist.</p></div>}
          <ol className="mt-tracks">{currentPlaylist.items.map((track, index) => <li key={track.id}>
            <span className="mt-track-number">{String(index + 1).padStart(2, '0')}</span>
            <button className="mt-track-open" disabled={busy} onClick={() => watchTrack(track)}>{track.title || 'Untitled video'}</button>
            {service?.reorderTrack && <><button aria-label={`Move ${track.title} up`} disabled={busy || index === 0} onClick={() => void mutate(() => service.reorderTrack?.(currentPlaylist.id, index, index - 1))}>↑</button><button aria-label={`Move ${track.title} down`} disabled={busy || index === currentPlaylist.items.length - 1} onClick={() => void mutate(() => service.reorderTrack?.(currentPlaylist.id, index, index + 1))}>↓</button></>}
            <button className="mt-delete" aria-label={`Remove ${track.title}`} disabled={busy} onClick={() => void mutate(() => { service?.removeTrack(currentPlaylist.id, track.id); setStatus('Video removed from playlist.') })}>×</button>
          </li>)}</ol>
        </> : view === 'watch' && video ? <>
          <button className="mt-back" onClick={back} disabled={busy}>← {playlistId ? currentPlaylist?.name || 'Playlist' : browse.kind === 'search' ? 'Search results' : 'Back to browsing'}</button>
          <div className="mt-player"><iframe key={video.id} title={video.title} src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /></div>
          <div className="mt-watch-info"><small>NOW PLAYING</small><h1>{video.title}</h1>{video.channel && <p>{video.channel}</p>}</div>
          <div className="mt-actions"><button className="mt-primary" disabled={!service || busy} onClick={saveVideo}>+ Save to playlist</button><button disabled={busy} onClick={() => void mutate(async () => { await navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${video.id}`); setStatus('Video link copied.') })}>Copy link</button><a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer">Open on YouTube ↗</a></div>
          {currentPlaylist && trackIndex >= 0 && <div className="mt-playlist-playback"><span>Playing {trackIndex + 1} of {currentPlaylist.items.length} · {currentPlaylist.name}</span><button disabled={busy || trackIndex === 0} onClick={() => watchTrack(currentPlaylist.items[trackIndex - 1]!)}>← Previous</button><button disabled={busy || trackIndex >= currentPlaylist.items.length - 1} onClick={() => watchTrack(currentPlaylist.items[trackIndex + 1]!)}>Next →</button></div>}
          <p className="mt-player-note">If a video can’t play here, open it on YouTube.</p>
        </> : <div className="mt-empty"><h2>Playlist unavailable</h2><button onClick={() => void showPlaylists()}>Back to playlists</button></div>}
      </main>
    </div>
    <footer className="mt-status"><span role="status" aria-live="polite">{busy ? 'Working on your collection…' : status}</span><span aria-hidden="true"><PixelSymbol kind="star" /> KEEP RECEIVING</span></footer>
  </div>
}

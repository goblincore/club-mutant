import { useEffect, useRef, useState } from 'react'
import { DESKTOP_ICONS, DESKTOP_ICON_LOOPS } from '../../lib/socialIcons'
import { localDestination, resolveNeetAddress, type NeetDestination, type NeetPageId } from '../../lib/neetNavigation'
import { useWindowStore } from '../../stores/windowStore'
import { AppWordmark, DoodleStar } from './AnalogAccents'
import { SignalTransition } from './SignalTransition'

const DESTINATIONS = [
  { app: 'mutanttube', name: 'TinyTubes', label: '01 / TRANSMISSIONS', description: 'Small audiences. Strange frequencies. Something you have never seen.', size: { width: 900, height: 650 } },
  { app: 'messenger', name: 'Messenger', label: '02 / CONTACT', description: 'Find somebody on the other side of the screen.', size: { width: 800, height: 600 } },
  { app: 'mutantbook', name: 'Guestbook', label: '03 / TRACES', description: 'Profiles, wall messages, and proof that you were here.', size: { width: 800, height: 600 } },
  { app: 'mutantmail', name: 'Postbox', label: '04 / LETTERS', description: 'A subject. A story. A message worth keeping.', size: { width: 800, height: 600 } },
] as const
const TABS: [NeetPageId, string][] = [['home', 'Start'], ['directory', 'Directory'], ['guide', 'Field guide'], ['about', 'About']]

function BrowserControl({ kind }: { kind: 'back' | 'forward' | 'home' | 'reload' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'back' && <path d="m13 5-7 7 7 7M6 12h14" />}
    {kind === 'forward' && <path d="m11 5 7 7-7 7M18 12H4" />}
    {kind === 'home' && <><path d="m4 11 8-7 8 7v9H4ZM9 20v-7h6v7" /></>}
    {kind === 'reload' && <><path d="M19 8a8 8 0 1 0 1 7M19 3v5h-5" /></>}
  </svg>
}

export function NEETscape() {
  const [history, setHistory] = useState<NeetDestination[]>([localDestination('home')])
  const [index, setIndex] = useState(0)
  const [address, setAddress] = useState('neet://home')
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [reload, setReload] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const page = history[index]

  useEffect(() => { content.current?.scrollTo(0, 0) }, [page, reload])

  function navigate(next: NeetDestination) {
    if (next.url !== page.url) {
      const nextHistory = history.slice(0, index + 1).concat(next)
      setHistory(nextHistory); setIndex(nextHistory.length - 1)
    }
    setAddress(next.url); setError(null)
  }
  function travel(nextIndex: number) {
    setIndex(nextIndex); setAddress(history[nextIndex].url); setError(null)
  }
  function visit(app: typeof DESTINATIONS[number]) {
    const store = useWindowStore.getState()
    const existing = Object.values(store.windows).filter((win) => win.app === app.app && win.workspace === store.currentWorkspace).sort((a, b) => b.zIndex - a.zIndex)[0]
    if (existing) {
      if (existing.shaded) store.shadeWindow(existing.id)
      if (existing.minimized) store.unminimizeWindow(existing.id)
      else store.focusWindow(existing.id)
    } else store.openWindow(app.app, { title: app.name, size: app.size })
  }
  const matches = DESTINATIONS.filter((destination) => `${destination.name} ${destination.label} ${destination.description}`.toLowerCase().includes(filter.toLowerCase().trim()))

  return <div className="neet-root" onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') { event.preventDefault(); input.current?.focus(); input.current?.select() }
  }}>
    <SignalTransition trigger={`${page.url}:${reload}`} />
    <header className="neet-header">
      <img src={DESKTOP_ICONS.netscape} alt="" /><div><AppWordmark label="NEETscape" /><small>A WINDOW BEYOND THE ROOM</small></div>
      <span className="neet-frequency" aria-hidden="true">NS / 00.01<DoodleStar /></span>
    </header>
    <div className="neet-navigation">
      <div className="neet-controls">
        <button aria-label="Back" disabled={index === 0} onClick={() => travel(index - 1)}><BrowserControl kind="back" /></button>
        <button aria-label="Forward" disabled={index === history.length - 1} onClick={() => travel(index + 1)}><BrowserControl kind="forward" /></button>
        <button aria-label="Home" onClick={() => navigate(localDestination('home'))}><BrowserControl kind="home" /></button>
        <button aria-label="Reload page" onClick={() => { setReload((value) => value + 1); setAddress(page.url); setError(null) }}><BrowserControl kind="reload" /></button>
      </div>
      <form className="neet-address" onSubmit={(event) => {
        event.preventDefault(); const next = resolveNeetAddress(address)
        if (next) navigate(next)
        else setError('Enter a NEETscape page or an http(s) web address.')
      }}><span aria-hidden="true">↗</span><input ref={input} aria-label="Address" value={address} onChange={(event) => setAddress(event.target.value)} spellCheck={false} autoComplete="off" /><button type="submit" aria-label="Go to address">Go</button></form>
    </div>
    <nav className="neet-tabs" aria-label="NEETscape pages">{TABS.map(([kind, label]) => <button key={kind} aria-current={page.kind === kind ? 'page' : undefined} onClick={() => navigate(localDestination(kind))}>{label}</button>)}</nav>
    {error && <p className="neet-error" role="alert">{error}</p>}
    <div className="neet-content" ref={content}>
      {page.kind === 'home' && <>
        <section className="neet-hero">
          <div className="neet-hero-copy"><small>OUTER NETWORK / INNER WORLD</small><h1>Stay in.<br /><em>Go far.</em></h1><p>Follow a signal. Find your people.</p><button className="neet-primary" onClick={() => navigate(localDestination('directory'))}>Find a frequency <span aria-hidden="true">↗</span></button></div>
          <div className="neet-orbit" aria-hidden="true"><i /><picture><source media="(prefers-reduced-motion: reduce)" srcSet={DESKTOP_ICONS.netscape} /><img src={DESKTOP_ICON_LOOPS.netscape} alt="" /></picture><span>NO PLACE LIKE HOMEPAGE</span></div>
        </section>
        <div className="neet-section-label"><span>NEARBY SIGNALS</span><span>FOUR WAYS OUT ↘</span></div>
        <div className="neet-destinations">{DESTINATIONS.map((destination) => <button key={destination.app} className="neet-destination" onClick={() => visit(destination)}><img src={DESKTOP_ICONS[destination.app]} alt="" /><span><small>{destination.label}</small><strong>{destination.name}</strong></span><span className="neet-link-arrow" aria-hidden="true">↗</span></button>)}</div>
      </>}
      {page.kind === 'directory' && <section className="neet-directory"><small className="neet-eyebrow">LOCAL NETWORK / LIVE CONNECTIONS</small><h1>Pick up a signal.</h1><p>Every door opens an app on this desktop.</p><input className="neet-filter" aria-label="Filter destinations" placeholder="Find a place…" value={filter} onChange={(event) => setFilter(event.target.value)} /><div className="neet-directory-grid">{matches.map((destination) => <button key={destination.app} className="neet-destination" onClick={() => visit(destination)}><img src={DESKTOP_ICONS[destination.app]} alt="" /><span><small>{destination.label}</small><strong>{destination.name}</strong><p>{destination.description}</p></span><span className="neet-link-arrow" aria-hidden="true">↗</span></button>)}</div>{matches.length === 0 && <p role="status">No matching destinations. Try another word.</p>}</section>}
      {page.kind === 'guide' && <section className="neet-reading"><small className="neet-eyebrow">FIELD GUIDE / 01</small><h1>Finding your way.</h1><dl><dt>The local network</dt><dd>Start and Directory connect you to Club Mutant apps. They open in their own desktop windows.</dd><dt>The address line</dt><dd>Enter <code>neet://home</code>, <code>neet://directory</code>, <code>neet://guide</code>, or <code>neet://about</code>. Press Ctrl or ⌘ + L while focused here to select the address.</dd><dt>The wider web</dt><dd>Enter a web address to prepare an external link, then choose Open website. The site opens in your web browser.</dd><dt>Returning</dt><dd>Back and Forward retrace your route. Home brings you here; Reload refreshes the current local view.</dd></dl><button onClick={() => navigate(localDestination('directory'))}>Explore the directory ↗</button></section>}
      {page.kind === 'about' && <section className="neet-about"><img src={DESKTOP_ICONS.netscape} alt="" /><small className="neet-eyebrow">KONPYUUTA / NETWORK NAVIGATOR</small><h1>NEETscape</h1><p>A small browser for a very large inside.</p><p className="neet-about-note">A local portal into Club Mutant, with a door to the wider web.</p><button onClick={() => navigate(localDestination('home'))}>Return to start ↗</button></section>}
      {page.kind === 'external' && <section className="neet-reading neet-external"><small className="neet-eyebrow">BEYOND THE LOCAL NETWORK</small><h1>{page.title}</h1><p>This destination opens in your web browser.</p><p className="neet-external-url">{page.url}</p><a className="neet-primary" href={page.url} target="_blank" rel="noopener noreferrer">Open website ↗</a><button onClick={() => navigate(localDestination('home'))}>Stay here</button></section>}
    </div>
    <footer className="neet-status"><span>{page.kind === 'external' ? 'EXTERNAL DESTINATION' : 'LOCAL NETWORK'}</span><span>{page.title} <i aria-hidden="true" /></span></footer>
  </div>
}

import { useEffect, useRef, useState } from 'react'
import { DESKTOP_ICONS, DESKTOP_ICON_LOOPS } from '../../lib/socialIcons'
import { localDestination, resolveNeetAddress, type NeetDestination, type NeetPageId } from '../../lib/neetNavigation'
import { useWindowStore } from '../../stores/windowStore'
import { AppWordmark } from './AnalogAccents'
import { NeetSignalScene } from './NeetSignalScene'
import { SignalTransition } from './SignalTransition'

const DESTINATIONS = [
  { app: 'mutanttube', name: 'TinyTubes', size: { width: 900, height: 650 } },
  { app: 'messenger', name: 'Messenger', size: { width: 800, height: 600 } },
  { app: 'mutantbook', name: 'Guestbook', size: { width: 800, height: 600 } },
  { app: 'mutantmail', name: 'Postbox', size: { width: 800, height: 600 } },
] as const
const TABS: [NeetPageId, string][] = [['home', 'Start'], ['about', 'About']]

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

  return <div className="neet-root" onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') { event.preventDefault(); input.current?.focus(); input.current?.select() }
  }}>
    <SignalTransition selective trigger={`${page.url}:${reload}`} />
    <header className="neet-header">
      <img src={DESKTOP_ICONS.netscape} alt="" /><div><AppWordmark label="NEETscape" /><small>CLUB MUTANT</small></div>
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
      {page.kind === 'home' && <section className="neet-signal-space" aria-label="Nearby signals">
        <NeetSignalScene />
        <div className="neet-floating-signals">{DESTINATIONS.map((destination) => <div key={destination.app} className="neet-signal-anchor">
          <button className="neet-floating-signal" onClick={() => visit(destination)} aria-label={'Open ' + destination.name}>
            <picture><source media="(prefers-reduced-motion: reduce)" srcSet={DESKTOP_ICONS[destination.app]} /><img src={DESKTOP_ICON_LOOPS[destination.app]} alt="" /></picture>
            <span>{destination.name}</span>
          </button>
        </div>)}</div>
        <span className="neet-space-label" aria-hidden="true">NEARBY SIGNALS</span>
      </section>}
      {(page.kind === 'directory' || page.kind === 'guide') && <section className="neet-reading"><h1>{page.title}</h1><p>This page is being reworked.</p><button onClick={() => navigate(localDestination('home'))}>Return to start</button></section>}
      {page.kind === 'about' && <section className="neet-reading neet-about"><small className="neet-eyebrow">ABOUT / CLUB MUTANT</small><h1 data-signal-text>Navigation &amp; tutorials</h1><p>Guides will appear here.</p></section>}
      {page.kind === 'external' && <section className="neet-reading neet-external"><small className="neet-eyebrow">BEYOND THE LOCAL NETWORK</small><h1 data-signal-text>{page.title}</h1><p>This destination opens in your web browser.</p><p className="neet-external-url">{page.url}</p><a className="neet-primary" href={page.url} target="_blank" rel="noopener noreferrer">Open website ↗</a><button onClick={() => navigate(localDestination('home'))}>Stay here</button></section>}
    </div>
    <footer className="neet-status"><span>{page.kind === 'external' ? 'EXTERNAL DESTINATION' : 'LOCAL NETWORK'}</span><span>{page.title} <i aria-hidden="true" /></span></footer>
  </div>
}

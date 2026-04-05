import { useState, useRef, useEffect } from 'react'
import pagesData from '../../data/netscape-pages.json'

interface NetscapePage {
  title: string
  url: string
  content?: string
  type?: string
  localPath?: string
}

const pages = pagesData as Record<string, NetscapePage>

const menuItems = [
  'File', 'Edit', 'View', 'Go', 'Bookmarks', 'Options', 'Directory', 'Help',
]

interface MenuState {
  open: string | null
}

export function NetscapeNavigator() {
  const [currentPageId, setCurrentPageId] = useState('whats-new')
  const [urlInput, setUrlInput] = useState(pages['whats-new'].url)
  const [isLoading, setIsLoading] = useState(false)
  const [history, setHistory] = useState<string[]>(['whats-new'])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [menu, setMenu] = useState<MenuState>({ open: null })
  const [statusText, setStatusText] = useState('Document: Done')
  const urlInputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const page = pages[currentPageId] ?? pages['whats-new']

  function navigate(pageId: string) {
    const target = pages[pageId]
    if (!target) {
      setStatusText(`Error: Unknown page "${pageId}"`)
      return
    }
    setIsLoading(true)
    setStatusText(`Connecting to ${target.url}...`)
    const newHistory = history.slice(0, historyIndex + 1).concat(pageId)
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    setCurrentPageId(pageId)
    setUrlInput(target.url)
    clearTimeout(loadTimerRef.current)
    loadTimerRef.current = setTimeout(() => {
      setIsLoading(false)
      setStatusText('Document: Done')
    }, 300)
  }

  function goBack() {
    if (historyIndex === 0) return
    const newIndex = historyIndex - 1
    const pageId = history[newIndex]
    const target = pages[pageId]
    setHistoryIndex(newIndex)
    setCurrentPageId(pageId)
    setUrlInput(target?.url ?? '')
    setIsLoading(true)
    clearTimeout(loadTimerRef.current)
    loadTimerRef.current = setTimeout(() => setIsLoading(false), 300)
  }

  function goForward() {
    if (historyIndex === history.length - 1) return
    const newIndex = historyIndex + 1
    const pageId = history[newIndex]
    const target = pages[pageId]
    setHistoryIndex(newIndex)
    setCurrentPageId(pageId)
    setUrlInput(target?.url ?? '')
    setIsLoading(true)
    clearTimeout(loadTimerRef.current)
    loadTimerRef.current = setTimeout(() => setIsLoading(false), 300)
  }

  function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Try to find a page by URL or id
    const input = urlInput.trim()
    const byId = pages[input]
    if (byId) {
      navigate(input)
      return
    }
    const byUrl = Object.entries(pages).find(([, p]) => p.url === input)
    if (byUrl) {
      navigate(byUrl[0])
      return
    }
    setStatusText(`Error: "${input}" not found`)
  }

  function handleContentClick(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest('.ns-link') as HTMLElement | null
    if (!a) return
    e.preventDefault()
    const onclick = a.getAttribute('onclick') ?? ''
    const match = onclick.match(/navigate\(['"]([^'"]+)['"]\)/)
    if (match) navigate(match[1])
  }

  function closeMenu() {
    setMenu({ open: null })
  }

  // Scroll content to top on page change
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0
    }
  }, [currentPageId])

  // Cleanup load timer on unmount
  useEffect(() => () => { clearTimeout(loadTimerRef.current) }, [])

  const canBack = historyIndex > 0
  const canForward = historyIndex < history.length - 1

  function renderMenu(label: string) {
    const isOpen = menu.open === label

    function getItems() {
      switch (label) {
        case 'File':
          return (
            <div className="ns-dropdown">
              <div className="ns-item" onClick={closeMenu}>New Window</div>
              <div className="ns-item" onClick={() => { closeMenu(); urlInputRef.current?.focus(); urlInputRef.current?.select() }}>Open Location…</div>
              <div className="ns-separator" />
              <div className="ns-item" onClick={closeMenu}>Close</div>
              <div className="ns-separator" />
              <div className="ns-item" onClick={closeMenu}>Quit</div>
            </div>
          )
        case 'Edit':
          return (
            <div className="ns-dropdown">
              <div className="ns-item ns-disabled">Undo<span className="ns-accel">Ctrl+Z</span></div>
              <div className="ns-separator" />
              <div className="ns-item ns-disabled">Cut<span className="ns-accel">Ctrl+X</span></div>
              <div className="ns-item ns-disabled">Copy<span className="ns-accel">Ctrl+C</span></div>
              <div className="ns-item ns-disabled">Paste<span className="ns-accel">Ctrl+V</span></div>
              <div className="ns-separator" />
              <div className="ns-item" onClick={closeMenu}>Find…</div>
            </div>
          )
        case 'View':
          return (
            <div className="ns-dropdown">
              <div className="ns-item" onClick={() => { closeMenu(); navigate(currentPageId) }}>Reload<span className="ns-accel">Ctrl+R</span></div>
              <div className="ns-item" onClick={closeMenu}>Load Images</div>
              <div className="ns-separator" />
              <div className="ns-item" onClick={closeMenu}>Document Source</div>
            </div>
          )
        case 'Go':
          return (
            <div className="ns-dropdown">
              <div className={`ns-item${!canBack ? ' ns-disabled' : ''}`} onClick={() => { closeMenu(); goBack() }}>Back<span className="ns-accel">Alt+←</span></div>
              <div className={`ns-item${!canForward ? ' ns-disabled' : ''}`} onClick={() => { closeMenu(); goForward() }}>Forward<span className="ns-accel">Alt+→</span></div>
              <div className="ns-item" onClick={() => { closeMenu(); navigate('welcome') }}>Home</div>
              <div className="ns-separator" />
              {Object.entries(pages).map(([id, p]) => (
                <div key={id} className="ns-item" onClick={() => { closeMenu(); navigate(id) }}>{p.title}</div>
              ))}
            </div>
          )
        case 'Bookmarks':
          return (
            <div className="ns-dropdown">
              <div className="ns-item ns-disabled">Add Bookmark<span className="ns-accel">Ctrl+D</span></div>
              <div className="ns-separator" />
              <div className="ns-item" onClick={() => { closeMenu(); navigate('welcome') }}>Welcome to Netscape</div>
            </div>
          )
        case 'Options':
          return (
            <div className="ns-dropdown">
              <div className="ns-item" onClick={closeMenu}>General Preferences…</div>
              <div className="ns-item" onClick={closeMenu}>Mail and News Preferences…</div>
              <div className="ns-item" onClick={closeMenu}>Network Preferences…</div>
              <div className="ns-separator" />
              <div className="ns-item" onClick={closeMenu}>Show Toolbar</div>
              <div className="ns-item" onClick={closeMenu}>Show Location</div>
              <div className="ns-item" onClick={closeMenu}>Show Directory Buttons</div>
            </div>
          )
        case 'Directory':
          return (
            <div className="ns-dropdown">
              <div className="ns-item" onClick={() => { closeMenu(); navigate('whats-new') }}>What's New!</div>
              <div className="ns-item" onClick={() => { closeMenu(); navigate('whats-cool') }}>What's Cool!</div>
              <div className="ns-item" onClick={closeMenu}>Netscape Galleria</div>
              <div className="ns-item" onClick={() => { closeMenu(); navigate('net-directory') }}>Internet Directory</div>
              <div className="ns-item" onClick={closeMenu}>Internet Search</div>
              <div className="ns-item" onClick={() => { closeMenu(); navigate('net-news') }}>Internet White Pages</div>
            </div>
          )
        case 'Help':
          return (
            <div className="ns-dropdown">
              <div className="ns-item" onClick={() => { closeMenu(); navigate('questions') }}>Handbook</div>
              <div className="ns-item" onClick={() => { closeMenu(); navigate('questions') }}>Frequently Asked Questions</div>
              <div className="ns-separator" />
              <div className="ns-item" onClick={() => { closeMenu(); navigate('about') }}>About Netscape…</div>
            </div>
          )
        default:
          return null
      }
    }

    return (
      <div
        key={label}
        className="ns-menu"
        onMouseEnter={() => menu.open !== null && setMenu({ open: label })}
        onMouseLeave={() => {}}
      >
        <span
          className="ns-menu-label"
          onMouseDown={(e) => {
            e.preventDefault()
            setMenu(prev => prev.open === label ? { open: null } : { open: label })
          }}
        >
          {label}
        </span>
        {isOpen && getItems()}
      </div>
    )
  }

  return (
    <div
      className="ns-shell"
      onClick={(e) => {
        if (menu.open && !(e.target as HTMLElement).closest('.ns-menu')) {
          closeMenu()
        }
      }}
    >
      {/* Menu bar */}
      <div className="ns-menubar">
        {menuItems.map(renderMenu)}
      </div>

      {/* Toolbar */}
      <div className="ns-toolbar">
        <div className="ns-toolbar-inner">
          <button
            className="ns-tool-btn"
            onClick={goBack}
            disabled={!canBack}
            title="Back"
          >
            <span>◀</span>
            <span>Back</span>
          </button>
          <button
            className="ns-tool-btn"
            onClick={goForward}
            disabled={!canForward}
            title="Forward"
          >
            <span>▶</span>
            <span>Forward</span>
          </button>
          <button
            className="ns-tool-btn"
            onClick={() => navigate('welcome')}
            title="Home"
          >
            <span>🏠</span>
            <span>Home</span>
          </button>
          <button
            className="ns-tool-btn"
            onClick={() => navigate(currentPageId)}
            title="Reload"
          >
            <span>↺</span>
            <span>Reload</span>
          </button>
          <button
            className="ns-tool-btn"
            onClick={() => setIsLoading(false)}
            title="Stop"
            disabled={!isLoading}
          >
            <span>✖</span>
            <span>Stop</span>
          </button>
          <button
            className="ns-tool-btn"
            onClick={() => urlInputRef.current?.focus()}
            title="Open"
          >
            <span>📂</span>
            <span>Open</span>
          </button>
          <button
            className="ns-tool-btn"
            onClick={closeMenu}
            title="Print"
          >
            <span>🖨</span>
            <span>Print</span>
          </button>
          <button
            className="ns-tool-btn"
            onClick={() => navigate('net-news')}
            title="Find"
          >
            <span>🔍</span>
            <span>Find</span>
          </button>
        </div>
        <div className={`ns-n-logo${isLoading ? ' ns-loading' : ''}`} title="Netscape">
          <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '32px', fontFamily: 'Times New Roman, serif', userSelect: 'none' }}>N</span>
        </div>
      </div>

      {/* Location bar */}
      <div className="ns-location-bar">
        <span className="ns-location-label">Location:</span>
        <form onSubmit={handleUrlSubmit} style={{ display: 'flex', flex: 1, gap: 6 }}>
          <input
            ref={urlInputRef}
            className="ns-url-input"
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" className="ns-dir-btn" style={{ whiteSpace: 'nowrap' }}>Open</button>
        </form>
      </div>

      {/* Directory bar */}
      <div className="ns-dir-bar">
        <button className="ns-dir-btn" onClick={() => navigate('whats-new')}>What's New!</button>
        <button className="ns-dir-btn" onClick={() => navigate('whats-cool')}>What's Cool!</button>
        <button className="ns-dir-btn" onClick={() => {}}>Handbook</button>
        <button className="ns-dir-btn" onClick={() => {}}>Net Search</button>
        <button className="ns-dir-btn" onClick={() => navigate('net-directory')}>Net Directory</button>
        <button className="ns-dir-btn" onClick={() => {}}>Software</button>
      </div>

      {/* Content area */}
      <div className="ns-content-wrapper">
        {page.type === 'local-iframe' ? (
          <iframe
            src={page.localPath}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title={page.title}
          />
        ) : (
          <div
            ref={contentRef}
            className="ns-content"
            onClick={handleContentClick}
            dangerouslySetInnerHTML={{ __html: page.content ?? '' }}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="ns-statusbar">
        <div className="ns-status-security">
          <span className="ns-lock" title="Security: Not encrypted">🔓</span>
        </div>
        <span className="ns-status-text">{statusText}</span>
        {isLoading && (
          <div className="ns-status-progress">
            <div className="ns-progress-bar" style={{ width: '60%' }} />
          </div>
        )}
      </div>
    </div>
  )
}

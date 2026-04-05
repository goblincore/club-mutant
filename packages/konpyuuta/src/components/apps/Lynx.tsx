import { useState, useRef, KeyboardEvent } from 'react'
import lynxPages from '../../data/lynx-pages.json'

interface LynxPage {
  title: string
  url: string
  content: string
  links: Array<{ num: number; text: string; url: string }>
}

const pages = lynxPages as Record<string, LynxPage>

export function Lynx() {
  const [currentUrl, setCurrentUrl] = useState('about:lynx')
  const [urlInput, setUrlInput] = useState('about:lynx')
  const [history, setHistory] = useState<string[]>(['about:lynx'])
  const [historyIndex, setHistoryIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const page = pages[currentUrl] ?? {
    title: 'Not Found',
    url: currentUrl,
    content: `Page not found: ${currentUrl}`,
    links: [],
  }

  function navigateTo(url: string) {
    if (url === 'history:back') {
      goBack()
      return
    }
    const newHistory = history.slice(0, historyIndex + 1).concat(url)
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    setCurrentUrl(url)
    setUrlInput(url)
  }

  function goBack() {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      const url = history[newIndex]
      setHistoryIndex(newIndex)
      setCurrentUrl(url)
      setUrlInput(url)
    }
  }

  function handleUrlKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      navigateTo(urlInput.trim())
    } else if (e.key === 'Escape') {
      setUrlInput(currentUrl)
      inputRef.current?.blur()
    }
  }

  // Render content, making [N]link text items clickable
  function renderContent() {
    let html = page.content
    // Replace [N]text references with clickable spans
    if (page.links && page.links.length > 0) {
      page.links.forEach(link => {
        const pattern = `[${link.num}]${link.text}`
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        html = html.replace(
          new RegExp(escaped, 'g'),
          `<span class="lynx-link" data-href="${link.url}">[${link.num}]${link.text}</span>`
        )
      })
    }
    return html
  }

  function handleContentClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    if (target.classList.contains('lynx-link')) {
      const href = target.getAttribute('data-href')
      if (href) navigateTo(href)
    }
  }

  return (
    <div className="lynx-root">
      <div className="lynx-topbar">
        <div className="lynx-title-row">
          <span className="lynx-app-name">Lynx</span>
          <span className="lynx-page-title">{page.title}</span>
        </div>
        <div className="lynx-input-line">
          <span className="lynx-input-prompt">URL:</span>
          <input
            ref={inputRef}
            className="lynx-url lynx-input"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            spellCheck={false}
          />
        </div>
      </div>
      <div
        className="lynx-content"
        dangerouslySetInnerHTML={{ __html: renderContent() }}
        onClick={handleContentClick}
      />
      <div className="lynx-commandbar">
        <span className="lynx-commands">
          Commands: Use arrow keys to move, '?' for help, 'Q' to quit, '=' for file info.
        </span>
      </div>
      <div className="lynx-statusbar">
        <span className="lynx-status-text">
          Arrow keys: Up and Down to move. Right to follow a link; Left to go back.
        </span>
        <span className="lynx-status-url"> — {currentUrl}</span>
      </div>
    </div>
  )
}

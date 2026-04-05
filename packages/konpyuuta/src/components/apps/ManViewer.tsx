import { useState } from 'react'
import manpagesData from '../../data/manpages.json'

interface ManPage {
  title?: string
  content: string
  synopsis?: string
  description?: string
  name?: string
  section?: string
}

export function ManViewer() {
  const pages = manpagesData as Record<string, ManPage>
  const pageKeys = Object.keys(pages)
  const [selectedPage, setSelectedPage] = useState(pageKeys[0])

  const current = pages[selectedPage]

  return (
    <div className="man-root">
      <div className="man-sidebar">
        {pageKeys.map(key => (
          <button
            key={key}
            className={`man-page-item${selectedPage === key ? ' active' : ''}`}
            onClick={() => setSelectedPage(key)}
          >
            {key}
          </button>
        ))}
      </div>
      <div className="man-content">
        <pre className="man-text">{current?.content ?? 'No content'}</pre>
      </div>
    </div>
  )
}

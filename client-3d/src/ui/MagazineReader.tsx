import { useState, useEffect } from 'react'

import { useUIStore } from '../stores/uiStore'

const MANIFEST_URL = '/textures/magazines/magazines.json'
const BASE_PATH = '/textures/magazines/'

interface MagazineEntry {
  id: string
  title: string
  cover: string
  pages: string[]
}

interface MagazineManifest {
  magazines: MagazineEntry[]
}

/** Grid view — shows all magazine covers for selection. */
function CoverGrid({
  magazines,
  onSelect,
}: {
  magazines: MagazineEntry[]
  onSelect: (mag: MagazineEntry) => void
}) {
  const [coverUrls, setCoverUrls] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    const urls = new Map<string, string>()

    for (const mag of magazines) {
      if (mag.cover) {
        urls.set(mag.id, `${BASE_PATH}${mag.cover}`)
      }
    }

    setCoverUrls(urls)
  }, [magazines])

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-3 gap-4">
        {magazines.map((mag) => {
          const coverUrl = coverUrls.get(mag.id)
          const hasPages = mag.pages.length > 0

          return (
            <button
              key={mag.id}
              onClick={() => onSelect(mag)}
              className="group flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-white/10 transition-colors"
            >
              <div
                className="w-full aspect-[3/4] rounded-md overflow-hidden border border-white/10 group-hover:border-white/30 transition-colors flex items-center justify-center"
                style={{ background: '#1a1a1e' }}
              >
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={mag.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <span className="text-[11px] text-white/30 font-mono">no cover</span>
                )}
              </div>

              <span className="text-[12px] font-mono text-white/70 group-hover:text-white transition-colors text-center leading-tight">
                {mag.title}
              </span>

              {!hasPages && <span className="text-[10px] font-mono text-white/30">cover only</span>}
            </button>
          )
        })}
      </div>

      {magazines.length === 0 && (
        <div className="flex items-center justify-center h-full">
          <span className="text-[13px] font-mono text-white/30">no magazines available</span>
        </div>
      )}
    </div>
  )
}

/** Page viewer — shows magazine pages with prev/next navigation. */
function PageViewer({ magazine, onBack }: { magazine: MagazineEntry; onBack: () => void }) {
  const [pageIndex, setPageIndex] = useState(0)

  // Build the full list: cover first, then pages
  const allPages = [magazine.cover, ...magazine.pages].filter(Boolean)
  const totalPages = allPages.length
  const currentSrc = `${BASE_PATH}${allPages[pageIndex]}`

  const handlePrev = () => setPageIndex((i) => Math.max(0, i - 1))
  const handleNext = () => setPageIndex((i) => Math.min(totalPages - 1, i + 1))

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') handlePrev()
      else if (e.key === 'ArrowRight' || e.key === 'd') handleNext()
      else if (e.key === 'Escape') onBack()
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [totalPages, onBack])

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10">
        <button
          onClick={onBack}
          className="text-[12px] font-mono text-white/50 hover:text-white transition-colors"
        >
          &larr; back
        </button>

        <span className="flex-1 text-[13px] font-mono text-white/70 truncate text-center">
          {magazine.title}
        </span>

        <span className="text-[11px] font-mono text-white/40">
          {pageIndex + 1} / {totalPages}
        </span>
      </div>

      {/* Page display */}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <img
            src={currentSrc}
            alt={`Page ${pageIndex + 1}`}
            className="max-h-full max-w-full object-contain rounded"
            style={{ imageRendering: 'auto' }}
          />
        </div>

        {/* Prev / Next click zones */}
        {pageIndex > 0 && (
          <button
            onClick={handlePrev}
            className="absolute left-0 top-0 bottom-0 w-1/4 flex items-center justify-start pl-4 text-white/0 hover:text-white/60 transition-colors"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        {pageIndex < totalPages - 1 && (
          <button
            onClick={handleNext}
            className="absolute right-0 top-0 bottom-0 w-1/4 flex items-center justify-end pr-4 text-white/0 hover:text-white/60 transition-colors"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

export function MagazineReader() {
  const open = useUIStore((s) => s.magazineReaderOpen)
  const [magazines, setMagazines] = useState<MagazineEntry[]>([])
  const [selectedMag, setSelectedMag] = useState<MagazineEntry | null>(null)

  // Fetch manifest when opened
  useEffect(() => {
    if (!open) {
      setSelectedMag(null)
      return
    }

    void (async () => {
      try {
        const res = await fetch(MANIFEST_URL)
        if (!res.ok) return
        const data = (await res.json()) as MagazineManifest
        setMagazines(data.magazines)
      } catch {
        console.warn('[MagazineReader] Could not load manifest')
      }
    })()
  }, [open])

  if (!open) return null

  const handleClose = () => {
    useUIStore.getState().setMagazineReaderOpen(false)
  }

  const handleBack = () => setSelectedMag(null)

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 40 }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

      {/* Reader window */}
      <div
        className="relative flex flex-col rounded-xl overflow-hidden"
        style={{
          width: '85vw',
          maxWidth: 900,
          height: '85vh',
          background: '#1e1e22',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center gap-2 px-3 py-2 select-none"
          style={{ background: '#2a2a2e' }}
        >
          {/* Traffic light dots */}
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full cursor-pointer"
              style={{ background: '#ff5f57', border: '1px solid #e0443e' }}
              onClick={handleClose}
            />

            <div
              className="w-3 h-3 rounded-full"
              style={{ background: '#febc2e', border: '1px solid #d4a022' }}
            />

            <div
              className="w-3 h-3 rounded-full"
              style={{ background: '#28c840', border: '1px solid #1aab29' }}
            />
          </div>

          <span className="flex-1 text-[12px] font-mono text-white/50 text-center">
            magazine rack
          </span>

          {/* Close button */}
          <button
            onClick={handleClose}
            className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content area */}
        {selectedMag ? (
          <PageViewer magazine={selectedMag} onBack={handleBack} />
        ) : (
          <CoverGrid magazines={magazines} onSelect={setSelectedMag} />
        )}
      </div>
    </div>
  )
}

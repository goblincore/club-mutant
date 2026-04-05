import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useDesktopStore } from '../../stores/desktopStore'
import { parseXpmToDataUrl } from '../../lib/xpmParser'
import palettesData from '../../data/cde_palettes.json'
import backdropsData from '../../data/backdrops.json'
import fontsData from '../../data/fonts.json'

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function normalizeCdeColor(color: string): string {
  if (color.startsWith('#') && color.length === 13) {
    const r = color.slice(1, 3)
    const g = color.slice(5, 7)
    const b = color.slice(9, 11)
    return `#${r}${g}${b}`
  }
  return color
}

function luminance(hex: string): number {
  const h = normalizeCdeColor(hex).replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastText(bg: string): string {
  return luminance(bg) > 0.4 ? '#000000' : '#ffffff'
}

function adjustColor(hex: string, amount: number): string {
  const h = normalizeCdeColor(hex).replace('#', '')
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const r = clamp(parseInt(h.slice(0, 2), 16) + amount * 255)
  const g = clamp(parseInt(h.slice(2, 4), 16) + amount * 255)
  const b = clamp(parseInt(h.slice(4, 6), 16) + amount * 255)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function paletteFromColors(name: string, colors: string[]) {
  const titlebar = normalizeCdeColor(colors[0] ?? '#a54a4a')
  const background = normalizeCdeColor(colors[1] ?? '#8b8ba5')
  return {
    name,
    background,
    foreground: contrastText(background),
    highlight: adjustColor(background, 0.15),
    shadow: adjustColor(background, -0.15),
    titlebar,
    titlebarText: contrastText(titlebar),
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PanelId =
  | 'color'
  | 'font'
  | 'backdrop'
  | 'keyboard'
  | 'mouse'
  | 'beep'
  | 'window'
  | 'screen'
  | 'startup'

const CATEGORIES: { id: PanelId; label: string; icon: string }[] = [
  { id: 'color', label: 'Color', icon: '/icons/apps/org.xfce.settings.appearance.png' },
  { id: 'font', label: 'Font', icon: '/icons/mimetypes/font-x-generic.png' },
  { id: 'backdrop', label: 'Backdrop', icon: '/icons/apps/preferences-desktop-wallpaper.png' },
  { id: 'keyboard', label: 'Keyboard', icon: '/icons/apps/org.xfce.settings.keyboard.png' },
  { id: 'mouse', label: 'Mouse', icon: '/icons/apps/org.xfce.settings.mouse.png' },
  { id: 'beep', label: 'Beep', icon: '/icons/devices/multimedia-volume-control.png' },
  { id: 'window', label: 'Window', icon: '/icons/apps/org.xfce.xfwm4.png' },
  { id: 'screen', label: 'Screen', icon: '/icons/devices/display.png' },
  { id: 'startup', label: 'Startup', icon: '/icons/system/gcr-key.png' },
]

// ---------------------------------------------------------------------------
// Sub-panels
// ---------------------------------------------------------------------------

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button className="style-manager-back-btn" onClick={onBack}>
      ◂ Back
    </button>
  )
}

// Color sub-panel
function ColorPanel({ onBack }: { onBack: () => void }) {
  const setPalette = useSettingsStore((s) => s.setPalette)
  const currentPalette = useSettingsStore((s) => s.palette)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <BackButton onBack={onBack} />
      <div className="settings-body">
        <div className="settings-palette-grid">
          {(palettesData as { id: string; name: string; colors: string[] }[]).map((p) => {
            const pal = paletteFromColors(p.name, p.colors)
            const isActive = currentPalette.name === p.name
            return (
              <button
                key={p.id}
                className={`palette-swatch${isActive ? ' palette-swatch--active' : ''}`}
                onClick={() => setPalette(pal)}
                title={p.name}
                style={{ background: pal.background }}
              >
                <div className="swatch-bar" style={{ background: pal.titlebar }} />
                <span className="swatch-label" style={{ color: pal.foreground }}>
                  {p.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Backdrop item with lazy IntersectionObserver canvas rendering
function BackdropItem({
  name,
  path,
  isActive,
  themeColors,
  cacheRef,
  paletteKey,
  onClick,
}: {
  name: string
  path: string
  isActive: boolean
  themeColors: Record<string, string>
  cacheRef: React.MutableRefObject<Map<string, string>>
  paletteKey: string
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const renderedRef = useRef(false)

  const renderCanvas = useCallback(async () => {
    if (renderedRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return

    // Check cache
    const cached = cacheRef.current.get(path)
    if (cached) {
      const img = new Image()
      img.onload = () => {
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.drawImage(img, 0, 0, 64, 48)
      }
      img.src = cached
      renderedRef.current = true
      return
    }

    try {
      const response = await fetch(path)
      if (!response.ok) return
      const text = await response.text()
      const dataUrl = await parseXpmToDataUrl(text, themeColors)
      if (!dataUrl) return

      cacheRef.current.set(path, dataUrl)
      renderedRef.current = true

      const img = new Image()
      img.onload = () => {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, 64, 48)
          ctx.drawImage(img, 0, 0, 64, 48)
        }
      }
      img.src = dataUrl
    } catch {
      // silently skip
    }
  }, [path, themeColors, cacheRef])

  useEffect(() => {
    renderedRef.current = false  // reset so renderCanvas will re-run
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => { if (e.isIntersecting) renderCanvas() })
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [renderCanvas, paletteKey])

  return (
    <div ref={containerRef}>
      <button
        className={`backdrop-item-new${isActive ? ' active' : ''}`}
        onClick={onClick}
        title={name}
      >
        <canvas ref={canvasRef} width={64} height={48} />
        <span>{name}</span>
      </button>
    </div>
  )
}

// Backdrop sub-panel
function BackdropPanel({ onBack }: { onBack: () => void }) {
  const setWallpaper = useDesktopStore((s) => s.setWallpaper)
  const wallpaper = useDesktopStore((s) => s.wallpaper)
  const palette = useSettingsStore((s) => s.palette)
  const cacheRef = useRef<Map<string, string>>(new Map())

  const paletteKey = JSON.stringify(palette)

  const themeColors = useMemo(() => ({
    '--window-color': palette.background,
    '--titlebar-color': palette.titlebar,
    '--text-color': palette.foreground,
    '--border-light': palette.highlight,
    '--border-dark': palette.shadow,
    '--dock-color': palette.background,
    '--titlebar-text-color': palette.titlebarText,
    '--button-active': palette.shadow,
  }), [palette])

  // Clear cache when palette changes so canvases re-render with new theme
  useEffect(() => {
    cacheRef.current.clear()
  }, [palette, cacheRef])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <BackButton onBack={onBack} />
      <div className="settings-body">
        <button
          className={`backdrop-item${wallpaper === null ? ' backdrop-item--active' : ''}`}
          onClick={() => setWallpaper(null)}
        >
          No backdrop
        </button>
        <div className="backdrop-grid">
          {(backdropsData as { name: string; file: string }[]).map((b) => {
            const path = `/backdrops/${b.file}`
            return (
              <BackdropItem
                key={b.file}
                name={b.name}
                path={path}
                isActive={wallpaper === path}
                themeColors={themeColors}
                cacheRef={cacheRef}
                paletteKey={paletteKey}
                onClick={() => setWallpaper(path)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Font sub-panel
function FontPanel({ onBack }: { onBack: () => void }) {
  const fontPreset = useSettingsStore((s) => s.fontPreset)
  const setFontPreset = useSettingsStore((s) => s.setFontPreset)

  const handleSelect = (key: string) => {
    setFontPreset(key)
    const fontVars = (fontsData as Record<string, Record<string, string>>)[key]
    if (!fontVars) return
    const root = document.querySelector('.cde-root') as HTMLElement
    if (root) {
      Object.entries(fontVars).forEach(([k, v]) => root.style.setProperty(k, v as string))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <BackButton onBack={onBack} />
      <div className="font-list">
        {Object.keys(fontsData as Record<string, unknown>).map((key) => (
          <button
            key={key}
            className={`font-item${fontPreset === key ? ' active' : ''}`}
            onClick={() => handleSelect(key)}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  )
}

// Static placeholder panel for non-implemented categories
function StaticPanel({ name, onBack }: { name: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <BackButton onBack={onBack} />
      <div className="settings-body">
        <div
          style={{
            padding: '12px',
            fontFamily: 'var(--font-family-base)',
            fontSize: 'var(--font-size-base)',
            color: 'var(--text-color)',
          }}
        >
          <strong>{name} settings</strong>
          <div style={{ marginTop: 12, opacity: 0.6 }}>(Not yet implemented)</div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root Settings component
// ---------------------------------------------------------------------------

export function Settings() {
  const [activePanel, setActivePanel] = useState<PanelId | null>(null)

  const statusText = activePanel
    ? CATEGORIES.find((c) => c.id === activePanel)?.label ?? ''
    : 'Select a category'

  return (
    <div className="settings-root">
      {activePanel === null && (
        <div className="style-manager-categories">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className="cde-category-icon-btn"
              onClick={() => setActivePanel(cat.id)}
              title={cat.label}
            >
              <img src={cat.icon} alt={cat.label} width={32} height={32} />
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      )}

      {activePanel === 'color' && <ColorPanel onBack={() => setActivePanel(null)} />}
      {activePanel === 'backdrop' && <BackdropPanel onBack={() => setActivePanel(null)} />}
      {activePanel === 'font' && <FontPanel onBack={() => setActivePanel(null)} />}
      {activePanel === 'keyboard' && (
        <StaticPanel name="Keyboard" onBack={() => setActivePanel(null)} />
      )}
      {activePanel === 'mouse' && <StaticPanel name="Mouse" onBack={() => setActivePanel(null)} />}
      {activePanel === 'beep' && <StaticPanel name="Beep" onBack={() => setActivePanel(null)} />}
      {activePanel === 'window' && (
        <StaticPanel name="Window" onBack={() => setActivePanel(null)} />
      )}
      {activePanel === 'screen' && (
        <StaticPanel name="Screen" onBack={() => setActivePanel(null)} />
      )}
      {activePanel === 'startup' && (
        <StaticPanel name="Startup" onBack={() => setActivePanel(null)} />
      )}

      <div className="cde-statusbar">
        <div className="cde-statusleft">CDE Style Manager</div>
        <div className="cde-statusright">{statusText}</div>
      </div>
    </div>
  )
}

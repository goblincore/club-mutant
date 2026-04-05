import { useState, useEffect } from 'react'
import { useDesktopStore } from '../stores/desktopStore'
import { useSettingsStore } from '../stores/settingsStore'
import { DesktopIcon } from './DesktopIcon'
import { loadXpmBackdrop } from '../lib/xpmParser'

export function Desktop() {
  const icons = useDesktopStore((s) => s.icons)
  const wallpaper = useDesktopStore((s) => s.wallpaper)
  const palette = useSettingsStore((s) => s.palette)

  const [parsedWallpaperUrl, setParsedWallpaperUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!wallpaper) {
      setParsedWallpaperUrl(null)
      return
    }

    let cancelled = false

    const themeColors = {
      '--window-color': palette.background,
      '--titlebar-color': palette.titlebar,
      '--text-color': palette.foreground,
      '--border-light': palette.highlight,
      '--border-dark': palette.shadow,
      '--dock-color': palette.background,
      '--titlebar-text-color': palette.titlebarText,
      '--button-active': palette.shadow,
    }

    if (wallpaper.endsWith('.pm')) {
      loadXpmBackdrop(wallpaper, themeColors).then((url) => {
        if (!cancelled) setParsedWallpaperUrl(url)
      })
    } else {
      setParsedWallpaperUrl(wallpaper)
    }

    return () => {
      cancelled = true
    }
  }, [wallpaper, palette])

  const desktopStyle: React.CSSProperties = parsedWallpaperUrl
    ? {
        backgroundImage: `url(${parsedWallpaperUrl})`,
        backgroundSize: 'auto',
        backgroundRepeat: 'repeat',
      }
    : {}

  return (
    <div className="cde-desktop" style={desktopStyle}>
      <div className="cde-desktop-icons">
        {icons.map((icon) => (
          <DesktopIcon key={icon.id} icon={icon} />
        ))}
      </div>
    </div>
  )
}

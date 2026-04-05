import { useDesktopStore } from '../stores/desktopStore'
import { useSettingsStore } from '../stores/settingsStore'
import { DesktopIcon } from './DesktopIcon'

export function Desktop() {
  const icons = useDesktopStore((s) => s.icons)
  const wallpaper = useDesktopStore((s) => s.wallpaper)
  const palette = useSettingsStore((s) => s.palette)

  const desktopStyle: React.CSSProperties = wallpaper
    ? { backgroundImage: `url(${wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: palette.background }

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

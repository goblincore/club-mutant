import type { DesktopIcon as DesktopIconType } from '../types'
import { useWindowStore } from '../stores/windowStore'
import { DESKTOP_ICONS, DESKTOP_ICON_LOOPS } from '../lib/socialIcons'

interface DesktopIconProps {
  icon: DesktopIconType
}

export function DesktopIcon({ icon }: DesktopIconProps) {
  const openWindow = useWindowStore((s) => s.openWindow)
  const signalApp = icon.app in DESKTOP_ICONS ? icon.app as keyof typeof DESKTOP_ICONS : null

  const handleDoubleClick = () => {
    openWindow(icon.app, {
      title: icon.label,
      props: icon.appProps,
    })
  }

  return (
    <div className="cde-desktop-icon" role="button" tabIndex={0} aria-label={`Open ${icon.label}`} onDoubleClick={handleDoubleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleDoubleClick()
        }
      }}>
      {signalApp ? <picture>
        <source media="(prefers-reduced-motion: reduce)" srcSet={DESKTOP_ICONS[signalApp]} />
        <img src={DESKTOP_ICON_LOOPS[signalApp]} alt="" className="cde-desktop-icon-img" draggable={false} />
      </picture> : <img src={icon.icon} alt="" className="cde-desktop-icon-img" draggable={false} />}
      <span className="cde-desktop-icon-label">{icon.label}</span>
    </div>
  )
}

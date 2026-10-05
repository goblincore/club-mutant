import type { DesktopIcon as DesktopIconType } from '../types'
import { useWindowStore } from '../stores/windowStore'

interface DesktopIconProps {
  icon: DesktopIconType
}

export function DesktopIcon({ icon }: DesktopIconProps) {
  const openWindow = useWindowStore((s) => s.openWindow)

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
      <img src={icon.icon} alt="" className="cde-desktop-icon-img" draggable={false} />
      <span className="cde-desktop-icon-label">{icon.label}</span>
    </div>
  )
}

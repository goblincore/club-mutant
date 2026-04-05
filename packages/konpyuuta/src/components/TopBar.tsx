import { useSettingsStore } from '../stores/settingsStore'

interface TopBarProps {
  onShutdown: () => void
}

export function TopBar({ onShutdown }: TopBarProps) {
  const palette = useSettingsStore((s) => s.palette)

  return (
    <div className="cde-topbar" style={{ backgroundColor: palette.titlebar, color: palette.titlebarText }}>
      <div className="cde-topbar-left">
        <span className="cde-topbar-app-name">KonpyuuTA</span>
      </div>
      <div className="cde-topbar-right">
        <button className="cde-topbar-btn cde-topbar-shutdown" onClick={onShutdown} aria-label="Shut down">
          ⏻
        </button>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { onlineFriendCount, useMessengerStore } from '../stores/messengerStore'
import { openPortalApp } from '../lib/portalApps'
import { useKonpyuuTA } from '../context/KonpyuuTAContext'

function useClock() {
  const [time, setTime] = useState(() => {
    const d = new Date()
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date()
      setTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`)
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  return time
}

interface TopBarProps {
  onShutdown: () => void
}

export function TopBar({ onShutdown }: TopBarProps) {
  const time = useClock()
  const soundEnabled = useSettingsStore(state => state.soundEnabled)
  const { userId, socialService } = useKonpyuuTA()
  const accountId = userId ?? socialService?.getCurrentUserId() ?? null
  const online = useMessengerStore((state) => state.ownerId === accountId ? onlineFriendCount(state) : null)

  return (
    <div className="cde-topbar">
      <div className="cde-topbar-left">
        <button className="cde-topbar-btn" onClick={onShutdown} aria-label="Return to Club Mutant">
          ⏻
        </button>
      </div>
      <div className="cde-topbar-right">
        <button className="portal-friends" data-online={online !== null && online > 0} aria-label={online === null ? 'Open Messenger · friend presence unavailable' : `Open Messenger · ${online} ${online === 1 ? 'friend' : 'friends'} online`} title="Open friends list" onClick={() => openPortalApp('messenger')}><i aria-hidden="true" />Friends <span>{online ?? '—'}</span></button>
        <button className="cde-topbar-btn portal-sound" aria-label={soundEnabled ? 'Mute interface sounds' : 'Unmute interface sounds'} aria-pressed={soundEnabled} onClick={() => useSettingsStore.getState().setSoundEnabled(!soundEnabled)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M11 4 5 9H2v6h3l6 5Z" />{soundEnabled ? <><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></> : <path d="m16 9 6 6m0-6-6 6" />}</svg>
        </button>
        <div className="sys-item" aria-label="Clock">
          {time}
        </div>
      </div>
    </div>
  )
}

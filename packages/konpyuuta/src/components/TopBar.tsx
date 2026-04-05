import { useState, useEffect } from 'react'

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

  return (
    <div className="cde-topbar">
      <div className="cde-topbar-left">
        <button className="cde-topbar-btn" onClick={onShutdown} aria-label="Shut down">
          ⏻
        </button>
      </div>
      <div className="cde-topbar-right">
        <div className="sys-item">
          <img src="/icons/devices/audio-volume-low.png" alt="audio" className="sys-icon" />
        </div>
        <div className="sys-item" aria-label="Clock">
          {time}
        </div>
      </div>
    </div>
  )
}

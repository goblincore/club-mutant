import { useOS5kStore } from '../../stores/os5000kStore'
import { OS5K_APPS } from './os5kAppRegistry'

export function OS5000kDesktop() {
  const openApp = useOS5kStore((s) => s.openApp)

  const handleOpenApp = (app: typeof OS5K_APPS[number]) => {
    openApp(app.id, app.name, app.icon, app.width, app.height)
  }

  return (
    <div className="absolute inset-0 select-none" style={{
      background: 'linear-gradient(135deg, #0a0a2e 0%, #1a1a3e 30%, #0d0d28 70%, #050518 100%)',
    }}>
      {/* Subtle grid pattern overlay */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      {/* Icon grid */}
      <div className="relative p-6 flex flex-wrap gap-4 content-start">
        {OS5K_APPS.map((app) => (
          <button
            key={app.id}
            onDoubleClick={() => handleOpenApp(app)}
            className="flex flex-col items-center gap-1 w-20 p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer group"
            title={app.description}
          >
            <span className="text-3xl group-hover:scale-110 transition-transform">{app.icon}</span>
            <span className="text-[11px] text-white/80 font-mono text-center leading-tight truncate w-full">
              {app.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

import { useGameStore } from '../stores/gameStore'

export function DisconnectedOverlay() {
  const status = useGameStore((s) => s.connectionStatus)

  if (status === 'connected') return null

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 p-8 border border-white/10 rounded-xl bg-black/60 backdrop-blur max-w-sm text-center">
        {status === 'reconnecting' ? <ReconnectingContent /> : <DisconnectedContent />}
      </div>
    </div>
  )
}

function ReconnectingContent() {
  return (
    <>
      <div className="flex items-center gap-2">
        <Spinner />
        <h2 className="text-lg font-bold text-white">Reconnecting...</h2>
      </div>

      <p className="text-sm text-white/50">
        Connection lost. Attempting to reconnect automatically.
      </p>
    </>
  )
}

function DisconnectedContent() {
  const handleRefresh = () => {
    window.location.reload()
  }

  return (
    <>
      <h2 className="text-lg font-bold text-red-400">Disconnected</h2>

      <p className="text-sm text-white/50">
        Could not reconnect to the server. The session may have expired.
      </p>

      <button
        onClick={handleRefresh}
        className="w-full bg-green-500/20 border border-green-400/30 text-green-300 rounded-lg px-4 py-2.5 text-sm font-bold hover:bg-green-500/30 transition-colors"
      >
        Refresh
      </button>
    </>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-white/60"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />

      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

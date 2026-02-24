import { useUIStore } from '../stores/uiStore'
import { getNetwork } from '../network/NetworkManager'

export function LeaveRoomPrompt() {
  const open = useUIStore((s) => s.leaveRoomPromptOpen)
  const setOpen = useUIStore((s) => s.setLeaveRoomPromptOpen)

  if (!open) return null

  const handleLeave = () => {
    getNetwork().disconnect() // if there is a disconnect method, or just reload
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto bg-black/60 backdrop-blur-sm">
      <div className="bg-black/80 border border-white/20 rounded-lg p-6 max-w-sm w-full font-mono text-center shadow-2xl">
        <h3 className="text-lg text-white mb-2">Leave Room?</h3>
        <p className="text-white/60 text-[13px] mb-6">Are you sure you want to disconnect and return to the lobby?</p>
        
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => setOpen(false)}
            className="px-4 py-2 border border-white/20 rounded text-[13px] text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleLeave}
            className="px-4 py-2 bg-red-500/20 border border-red-500/50 rounded text-[13px] text-red-400 hover:bg-red-500/40 hover:text-red-300 transition-colors"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}

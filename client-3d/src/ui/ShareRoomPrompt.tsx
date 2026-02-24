import { useState } from 'react'
import { getNetwork } from '../network/NetworkManager'

export function ShareRoomPrompt({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const roomId = getNetwork().getRoomId()
  const shareUrl = `${window.location.origin}/?room=${roomId}`

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto bg-black/60 backdrop-blur-sm">
      <div className="bg-black/80 border border-white/20 rounded-lg p-6 max-w-sm w-full font-mono text-center shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-white/50 hover:text-white transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <h3 className="text-lg text-white mb-2 font-sans tracking-wide">Share Room</h3>
        <p className="text-white/60 text-[13px] mb-6 leading-relaxed">
          Invite others to join you in this room. Copy the link below and send it to a friend!
        </p>
        
        <div className="flex items-center gap-2 mb-6 bg-white/5 border border-white/10 rounded p-2 text-[12px] text-purple-300 overflow-hidden font-mono">
          <div className="flex-1 truncate select-all">{shareUrl}</div>
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-white/20 rounded text-[13px] text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleCopy}
            className={`px-4 py-2 border rounded text-[13px] transition-colors flex items-center gap-2 ${
              copied
                ? 'bg-green-500/20 border-green-500/50 text-green-400'
                : 'bg-purple-500/20 border-purple-500/50 text-purple-300 hover:bg-purple-500/30 hover:text-purple-200'
            }`}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>
    </div>
  )
}

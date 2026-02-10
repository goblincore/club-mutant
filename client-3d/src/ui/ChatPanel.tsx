import { useRef, useEffect } from 'react'

import { useChatStore } from '../stores/chatStore'
import { getNetwork } from '../network/NetworkManager'

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages)
  const inputValue = useChatStore((s) => s.inputValue)
  const setInputValue = useChatStore((s) => s.setInputValue)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  const handleSend = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    getNetwork().sendChat(trimmed)
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-1 p-2 text-xs"
      >
        {messages.map((msg) => (
          <div key={msg.id} className="leading-tight">
            {msg.author === 'system' ? (
              <span className="text-white/30 italic">{msg.content}</span>
            ) : (
              <>
                <span className="text-green-300 font-bold">{msg.author}</span>
                <span className="text-white/60">: {msg.content}</span>
              </>
            )}
          </div>
        ))}

        {messages.length === 0 && (
          <p className="text-white/20 text-center mt-4">No messages yet</p>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-white/30 focus:border-green-400/50 focus:outline-none"
        />
      </div>
    </div>
  )
}

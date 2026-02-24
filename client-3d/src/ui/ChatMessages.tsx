import { useRef, useEffect } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useUIStore } from '../stores/uiStore'

export function ChatMessages() {
  const messages = useChatStore((s) => s.messages)
  const expanded = useUIStore((s) => s.rightPanelOpen)
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, expanded])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-1 p-3 text-[13px]"
      >
        {messages.map((msg) => (
          <div key={msg.id} className="leading-tight hover:bg-white/[0.08] px-1 py-1 rounded">
            {msg.author === 'system' ? (
              <span className="text-white/70 italic">{msg.content}</span>
            ) : (
              <>
                <span className="text-green-300 font-bold">{msg.author}</span>
                <span className="text-white/80 font-mono">: {msg.content}</span>
              </>
            )}
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-white/40 text-center mt-4 font-mono">No messages yet</p>
        )}
      </div>
    </div>
  )
}

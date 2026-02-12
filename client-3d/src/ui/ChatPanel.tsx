import { useRef, useEffect, useState } from 'react'

import { useChatStore } from '../stores/chatStore'
import { useUIStore } from '../stores/uiStore'
import { getNetwork } from '../network/NetworkManager'

const CHAT_WIDTH = 340

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages)
  const inputValue = useChatStore((s) => s.inputValue)
  const setInputValue = useChatStore((s) => s.setInputValue)
  const expanded = useUIStore((s) => s.chatExpanded)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)

  // Auto-scroll to bottom on new messages or when expanding
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, expanded])

  // Global Enter key to focus the chat input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      if (focused) return

      const target = e.target as HTMLElement | null
      const isTyping =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable

      if (isTyping) return

      e.preventDefault()
      e.stopPropagation()

      setFocused(true)

      setTimeout(() => inputRef.current?.focus(), 0)
    }

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true })

    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true })
  }, [focused])

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

      // Keep focused after sending
      setFocused(true)

      setTimeout(() => inputRef.current?.focus(), 0)
    }

    if (e.key === 'Escape') {
      inputRef.current?.blur()
      setFocused(false)
      useUIStore.getState().toggleChatExpanded()
    }
  }

  const toggleExpanded = () => {
    useUIStore.getState().toggleChatExpanded()

    if (!expanded) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  return (
    <div
      className="fixed bottom-0 right-0 flex flex-col pointer-events-none"
      style={{ width: CHAT_WIDTH, height: expanded ? '100vh' : 'auto', zIndex: 20 }}
    >
      {/* Message list — only when expanded */}
      {expanded && (
        <>
          {/* Header */}
          <div className="pointer-events-auto bg-black/[0.85] backdrop-blur-md border border-white/[0.15] border-b-0 rounded-t-lg mx-4 mt-4 px-3 py-2 flex items-center justify-between">
            <span className="text-base font-mono text-white">chat</span>

            <button
              onClick={toggleExpanded}
              className="w-7 h-7 flex items-center justify-center text-white/80 hover:text-white transition-colors rounded hover:bg-white/15"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="pointer-events-auto flex-1 overflow-y-auto space-y-1 p-2 text-[13px] bg-black/[0.65] backdrop-blur-md border-x border-white/[0.15] mx-4"
          >
            {messages.map((msg) => (
              <div key={msg.id} className="leading-tight hover:bg-white/[0.08] px-1 rounded">
                {msg.author === 'system' ? (
                  <span className="text-white/70 italic">{msg.content}</span>
                ) : (
                  <>
                    <span className="text-green-300 font-bold">{msg.author}</span>
                    <span className="text-white/80">: {msg.content}</span>
                  </>
                )}
              </div>
            ))}

            {messages.length === 0 && (
              <p className="text-white/40 text-center mt-4">No messages yet</p>
            )}
          </div>
        </>
      )}

      {/* Input bar — always visible */}
      <div
        className={`pointer-events-auto mx-4 mb-4 flex items-center bg-black/[0.75] backdrop-blur-md border border-white/[0.15] transition-all duration-150 ${
          expanded ? 'rounded-b-lg rounded-t-none' : 'rounded-lg'
        } ${focused ? 'shadow-[0_0_8px_2px_rgba(255,255,255,0.6),0_0_20px_6px_rgba(200,230,255,0.3)] border-white/70' : ''}`}
      >
        {/* Chat toggle icon */}
        <button
          onClick={toggleExpanded}
          className="px-2.5 py-2 text-white/60 hover:text-white transition-colors flex-shrink-0"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Press Enter to chat"
          className="flex-1 bg-transparent py-2 pr-3 text-[13px] text-white font-mono placeholder-white/50 focus:outline-none"
        />
      </div>
    </div>
  )
}

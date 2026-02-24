import { useRef, useEffect, useState } from 'react'

import { useChatStore } from '../stores/chatStore'
import { getNetwork } from '../network/NetworkManager'

const CHAT_WIDTH = 400

export function ChatInput() {
  const inputValue = useChatStore((s) => s.inputValue)
  const setInputValue = useChatStore((s) => s.setInputValue)

  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)

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
    }
  }

  return (
    <div
      className="fixed bottom-0 left-1/2 -translate-x-1/2 pointer-events-none"
      style={{ zIndex: 20 }}
    >
      <div
        style={{ width: CHAT_WIDTH }}
        className={`pointer-events-auto mx-4 mb-4 flex items-center bg-black/[0.75] backdrop-blur-md border border-white/[0.15] transition-all duration-150 rounded-lg ${
          focused ? 'shadow-[0_0_8px_2px_rgba(255,255,255,0.6),0_0_20px_6px_rgba(200,230,255,0.3)] border-white/70' : ''
        }`}
      >
        <div className="px-2.5 py-2 text-white/60 flex-shrink-0">
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
        </div>

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

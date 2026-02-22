import { useRef, useEffect, useCallback, useMemo, type KeyboardEvent } from 'react'
import { useDreamChatStore } from '../stores/dreamChatStore'
import { useDreamClientStore } from '../stores/dreamClientStore'
import { chatWithNpc } from '../npc/npcService'

// Stable empty array to avoid creating new references
const EMPTY_MESSAGES: ReturnType<typeof useDreamChatStore.getState>['messageHistory'][string] = []

/**
 * DreamChatPanel — Chat input + message history overlay.
 * Appears when player is near an NPC (activeNpcId is set).
 * Styled to match the existing ChatPanel in client-3d.
 */
export function DreamChatPanel() {
  const activeNpcId = useDreamChatStore((s) => s.activeNpcId)
  const activeNpcName = useDreamChatStore((s) => s.activeNpcName)
  const thinking = useDreamChatStore((s) => s.thinking)
  const messageHistory = useDreamChatStore((s) => s.messageHistory)
  const inputRef = useRef<HTMLInputElement>(null)

  // Derive messages from the history using a stable reference
  const messages = useMemo(
    () => (activeNpcId ? messageHistory[activeNpcId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES),
    [activeNpcId, messageHistory]
  )

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, thinking])

  const handleSend = useCallback(async () => {
    const input = inputRef.current
    if (!input || !activeNpcId) return

    const text = input.value.trim()
    if (!text) return

    input.value = ''

    const store = useDreamChatStore.getState()
    const clientStore = useDreamClientStore.getState()

    // Add player message
    store.addMessage(activeNpcId, 'player', text)

    // Show player chat bubble
    store.addBubble({ entityId: 'player', text, expiresAt: Date.now() + 5000 })

    // Show thinking state
    store.setThinking(true)

    try {
      const history = store.messageHistory[activeNpcId] ?? []
      const response = await chatWithNpc(
        activeNpcId,
        text,
        history,
        clientStore.dreamServiceUrl
      )

      store.setThinking(false)

      // Add NPC response
      store.addMessage(activeNpcId, 'npc', response.text)

      // Show NPC chat bubble
      store.addBubble({
        entityId: activeNpcId,
        text: response.text,
        expiresAt: Date.now() + 5000,
      })
    } catch {
      store.setThinking(false)
      // Fallback response
      const fallback = 'The dream shifts...'
      store.addMessage(activeNpcId, 'npc', fallback)
      store.addBubble({
        entityId: activeNpcId,
        text: fallback,
        expiresAt: Date.now() + 5000,
      })
    }
  }, [activeNpcId])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Stop propagation so Phaser keyboard manager doesn't capture WASD etc.
      e.stopPropagation()

      if (e.key === 'Enter') {
        e.preventDefault()
        handleSend()
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur()
      }
    },
    [handleSend]
  )

  if (!activeNpcId) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: 320,
        maxHeight: 280,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 8,
        overflow: 'hidden',
        fontFamily: "'Courier New', monospace",
        fontSize: 13,
        color: '#fff',
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 1,
          color: 'rgba(255, 255, 255, 0.5)',
        }}
      >
        {activeNpcName}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              color: msg.sender === 'player' ? 'rgba(255, 255, 255, 0.6)' : '#00ff88',
              fontStyle: msg.sender === 'npc' ? 'italic' : 'normal',
            }}
          >
            {msg.sender === 'player' ? '> ' : ''}
            {msg.text}
          </div>
        ))}
        {thinking && (
          <div style={{ color: 'rgba(0, 255, 136, 0.5)', fontStyle: 'italic' }}>...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder={`talk to ${activeNpcName?.toLowerCase()}...`}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            // Disable Phaser keyboard capture so WASD etc. work in the input
            const game = (window as unknown as { __phaserGame?: Phaser.Game }).__phaserGame
            if (game?.input.keyboard) {
              game.input.keyboard.enabled = false
            }
          }}
          onBlur={() => {
            // Re-enable Phaser keyboard capture
            const game = (window as unknown as { __phaserGame?: Phaser.Game }).__phaserGame
            if (game?.input.keyboard) {
              game.input.keyboard.enabled = true
            }
          }}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#fff',
            fontFamily: "'Courier New', monospace",
            fontSize: 13,
          }}
        />
      </div>
    </div>
  )
}

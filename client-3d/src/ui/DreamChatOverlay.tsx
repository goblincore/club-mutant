import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import { useUIStore } from '../stores/uiStore'

// ── Dream NPC personality data (from client-dream/src/npc/npcPersonalities.ts) ──

interface NpcClientConfig {
  id: string
  name: string
  greetings: string[]
  fallbackPhrases: string[]
}

const NPC_CLIENT_CONFIGS: Record<string, NpcClientConfig> = {
  watcher: {
    id: 'watcher',
    name: 'The Watcher',
    greetings: [
      'You again.',
      'The doors told me you were coming.',
      'I was counting the tiles. You interrupted.',
      'You smell like the waking world.',
      'The doors have been rearranging.',
    ],
    fallbackPhrases: [
      'I was once like you. I forgot to wake up.',
      'The tiles hum a note only the dreaming can hear.',
      'Something stirs behind the green door.',
      'I have been here since before the doors.',
      'The dream does not answer. It listens.',
      'You are closer than you think.',
      'One of these doors opens onto itself.',
      'The forest remembers a color it lost.',
      'Time moves differently near the edges.',
      'I can feel the waking world pulling at you.',
    ],
  },
  drifter: {
    id: 'drifter',
    name: 'The Drifter',
    greetings: [
      'Oh. You can see me?',
      'I thought I was alone here.',
      'Which way is out? Do you know?',
      "Don't mind me. I'm just... passing through.",
    ],
    fallbackPhrases: [
      'I keep walking but the paths change.',
      'Have you seen the flower? The one with color?',
      'The trees whisper but I cannot hear them clearly.',
      "I think I've been here before. Or will be.",
      "There's something hidden where the path forgets itself.",
      'The ground feels different near the old roots.',
      "I found something once. Then I blinked and it wasn't.",
      'Do you hear that humming? Under the tiles?',
    ],
  },
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function getGreeting(npcId: string): string {
  const config = NPC_CLIENT_CONFIGS[npcId]
  if (!config) return '...'
  return pickRandom(config.greetings)
}

function getFallback(npcId: string): string {
  const config = NPC_CLIENT_CONFIGS[npcId]
  if (!config) return 'The dream shifts.'
  return pickRandom(config.fallbackPhrases)
}

// ── Constants ────────────────────────────────────────────────────────────

const DREAM_SERVICE_URL =
  import.meta.env.VITE_DREAM_SERVICE_URL || 'http://localhost:4000'

const NPC_IDS = Object.keys(NPC_CLIENT_CONFIGS)

// ── Types ────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  sender: 'player' | 'npc'
  npcName?: string
  text: string
}

// ── Component ────────────────────────────────────────────────────────────

export function DreamChatOverlay() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeNpc] = useState(() => pickRandom(NPC_IDS))
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const playerName = useGameStore((s) => {
    const myId = s.mySessionId
    return myId ? s.players.get(myId)?.name || 'dreamer' : 'dreamer'
  })

  // Auto-greeting on mount
  useEffect(() => {
    const greeting = getGreeting(activeNpc)
    const npcConfig = NPC_CLIENT_CONFIGS[activeNpc]
    setMessages([
      {
        id: crypto.randomUUID(),
        sender: 'npc',
        npcName: npcConfig?.name,
        text: greeting,
      },
    ])

    return () => {
      abortRef.current?.abort()
    }
  }, [activeNpc])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return

      const playerMsg: ChatMessage = {
        id: crypto.randomUUID(),
        sender: 'player',
        text: text.trim(),
      }
      setMessages((prev) => [...prev, playerMsg])
      setInput('')
      setIsLoading(true)

      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort

      try {
        const history = messages.slice(-10).map((m) => ({
          role: m.sender === 'player' ? 'user' : 'assistant',
          content: m.text,
        }))

        const res = await fetch(`${DREAM_SERVICE_URL}/dream/npc-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalityId: activeNpc,
            message: text.trim(),
            history,
            senderName: playerName,
          }),
          signal: AbortSignal.timeout(8000),
        })

        if (abort.signal.aborted) return

        const data = await res.json()
        const npcConfig = NPC_CLIENT_CONFIGS[activeNpc]

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: 'npc',
            npcName: npcConfig?.name,
            text: data.text || getFallback(activeNpc),
          },
        ])
      } catch {
        if (abort.signal.aborted) return
        const npcConfig = NPC_CLIENT_CONFIGS[activeNpc]
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: 'npc',
            npcName: npcConfig?.name,
            text: getFallback(activeNpc),
          },
        ])
      }

      setIsLoading(false)
    },
    [activeNpc, isLoading, messages, playerName]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void sendMessage(input)
      }
    },
    [input, sendMessage]
  )

  const handleWakeUp = useCallback(() => {
    useUIStore.getState().setWakePromptOpen(true)
  }, [])

  const npcConfig = NPC_CLIENT_CONFIGS[activeNpc]

  return (
    <div
      className="fixed bottom-4 left-4 flex flex-col gap-2"
      style={{ zIndex: 60, maxWidth: 360, width: '100%' }}
    >
      {/* Chat messages */}
      <div className="rounded-lg bg-black/40 backdrop-blur-sm p-3 max-h-[300px] overflow-y-auto">
        {messages.map((msg) => (
          <div key={msg.id} className={`mb-2 ${msg.sender === 'npc' ? '' : 'text-right'}`}>
            {msg.sender === 'npc' && msg.npcName && (
              <div
                className="text-[10px] font-mono uppercase tracking-wider mb-0.5"
                style={{ color: activeNpc === 'watcher' ? '#818cf8' : '#fbbf24' }}
              >
                {msg.npcName}
              </div>
            )}
            <div
              className={`inline-block px-2.5 py-1.5 rounded-lg text-xs font-mono leading-relaxed max-w-[85%] ${
                msg.sender === 'npc'
                  ? 'bg-white/10 text-white/80'
                  : 'bg-white/20 text-white/90'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="mb-2">
            <div
              className="text-[10px] font-mono uppercase tracking-wider mb-0.5"
              style={{ color: activeNpc === 'watcher' ? '#818cf8' : '#fbbf24' }}
            >
              {npcConfig?.name}
            </div>
            <div className="inline-block px-2.5 py-1.5 rounded-lg text-xs font-mono bg-white/10 text-white/40">
              ...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input + wake button */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="speak into the dream..."
          className="flex-1 bg-black/40 backdrop-blur-sm text-white/80 text-xs font-mono px-3 py-2 rounded-lg border border-white/10 outline-none placeholder:text-white/30 focus:border-white/20"
        />
        <button
          onClick={handleWakeUp}
          className="bg-white/10 hover:bg-white/20 text-white/60 hover:text-white/90 text-[10px] font-mono uppercase tracking-wider px-3 py-2 rounded-lg border border-white/10 transition-colors"
        >
          wake
        </button>
      </div>
    </div>
  )
}

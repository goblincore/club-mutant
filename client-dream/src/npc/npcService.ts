import type { ChatMessage } from '../stores/dreamChatStore'

/**
 * npcService — HTTP client for the POST /dream/npc-chat endpoint.
 * Handles request debouncing and fallback responses.
 */

const MIN_INTERVAL_MS = 2000
let lastRequestTime = 0

export interface NpcChatResponse {
  text: string
  behavior?: 'idle' | 'wander' | 'follow' | 'flee' | 'turn_to_player'
}

// Client-side fallback phrases (used when server is down)
const GENERIC_FALLBACKS = [
  'The dream shifts around you.',
  "Something stirs in the distance.",
  'You hear a sound that was never a sound.',
  'The air tastes like a forgotten word.',
  'A door closes somewhere you have never been.',
  'The tiles rearrange when you blink.',
  'Time moves differently here.',
  'You feel watched by something patient.',
  'The walls remember your name.',
  'A color you cannot describe pulses briefly.',
  'The ground hums a note only the dreaming can hear.',
  'Something is waiting. It has always been waiting.',
  'The shadows here have weight.',
  'You are closer than you think.',
  'The dream does not answer. It listens.',
]

function getRandomFallback(): string {
  return GENERIC_FALLBACKS[Math.floor(Math.random() * GENERIC_FALLBACKS.length)]
}

export async function chatWithNpc(
  personalityId: string,
  message: string,
  history: ChatMessage[],
  dreamServiceUrl: string
): Promise<NpcChatResponse> {
  // Debounce
  const now = Date.now()
  if (now - lastRequestTime < MIN_INTERVAL_MS) {
    return { text: getRandomFallback() }
  }
  lastRequestTime = now

  // In dev, Vite proxies /dream/* to the standalone dream-npc service (port 4000).
  // In production, dreamServiceUrl points to https://dream.mutante.club
  const baseUrl = import.meta.env.DEV ? '' : dreamServiceUrl

  try {
    const res = await fetch(`${baseUrl}/dream/npc-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalityId,
        message,
        history: history.slice(-10).map((m) => ({
          role: m.sender === 'player' ? 'user' : 'assistant',
          content: m.text,
        })),
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (res.status === 429) {
      // Rate limited — use fallback
      return { text: getRandomFallback() }
    }

    if (!res.ok) {
      return { text: getRandomFallback() }
    }

    const data = await res.json()
    return {
      text: data.text || getRandomFallback(),
      behavior: data.behavior,
    }
  } catch {
    // Timeout or network error — use fallback
    return { text: getRandomFallback() }
  }
}

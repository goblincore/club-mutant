/**
 * dreamNpc.ts — NPC chat handler for dream mode.
 *
 * Phase 1: Gemini 2.5 Flash-Lite API
 * Future: Swappable to self-hosted Ollama (LFM2.5-1.2B)
 */

// ── Rate Limiting (in-memory) ──

interface RateWindow {
  count: number
  resetAt: number
}

const perSessionRates = new Map<string, { minute: RateWindow; hour: RateWindow; day: RateWindow }>()
const globalRate = {
  minute: { count: 0, resetAt: 0 } as RateWindow,
  hour: { count: 0, resetAt: 0 } as RateWindow,
  day: { count: 0, resetAt: 0 } as RateWindow,
}

const LIMITS = {
  session: { minute: 6, hour: 60, day: 200 },
  global: { minute: 30, hour: 500, day: 5000 },
}

function checkRateLimit(sessionKey: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now()

  // Check global limits
  const globalChecks: [RateWindow, number, number][] = [
    [globalRate.minute, LIMITS.global.minute, 60_000],
    [globalRate.hour, LIMITS.global.hour, 3600_000],
    [globalRate.day, LIMITS.global.day, 86400_000],
  ]

  for (const [w, lim, duration] of globalChecks) {
    if (now > w.resetAt) {
      w.count = 0
      w.resetAt = now + duration
    }
    if (w.count >= lim) {
      return { allowed: false, retryAfterMs: w.resetAt - now }
    }
  }

  // Check per-session limits
  if (!perSessionRates.has(sessionKey)) {
    perSessionRates.set(sessionKey, {
      minute: { count: 0, resetAt: now + 60_000 },
      hour: { count: 0, resetAt: now + 3600_000 },
      day: { count: 0, resetAt: now + 86400_000 },
    })
  }
  const session = perSessionRates.get(sessionKey)!

  const sessionChecks: [keyof typeof session, number][] = [
    ['minute', LIMITS.session.minute],
    ['hour', LIMITS.session.hour],
    ['day', LIMITS.session.day],
  ]

  for (const [key, limit] of sessionChecks) {
    const w = session[key]
    const duration = key === 'minute' ? 60_000 : key === 'hour' ? 3600_000 : 86400_000
    if (now > w.resetAt) {
      w.count = 0
      w.resetAt = now + duration
    }
    if (w.count >= limit) {
      return { allowed: false, retryAfterMs: w.resetAt - now }
    }
  }

  return { allowed: true }
}

function recordRequest(sessionKey: string) {
  globalRate.minute.count++
  globalRate.hour.count++
  globalRate.day.count++

  const session = perSessionRates.get(sessionKey)
  if (session) {
    session.minute.count++
    session.hour.count++
    session.day.count++
  }
}

// ── Response Cache ──

interface CacheEntry {
  text: string
  behavior?: string
  expiresAt: number
}

const responseCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 3600_000 // 1 hour
const CACHE_MAX = 500

function getCacheKey(personalityId: string, message: string): string {
  const normalized = message.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
  return `${personalityId}::${normalized}`
}

function getCached(key: string): CacheEntry | null {
  const entry = responseCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key)
    return null
  }
  return entry
}

function setCache(key: string, text: string, behavior?: string) {
  // LRU eviction
  if (responseCache.size >= CACHE_MAX) {
    const firstKey = responseCache.keys().next().value
    if (firstKey) responseCache.delete(firstKey)
  }
  responseCache.set(key, { text, behavior, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ── NPC Personalities ──

interface NpcPersonality {
  id: string
  systemPrompt: string
  fallbackPhrases: string[]
}

const PERSONALITIES: Record<string, NpcPersonality> = {
  watcher: {
    id: 'watcher',
    systemPrompt: `You are a being in a dream. Someone fell asleep and found you here.
You do not know you are in a game. You exist only in this dream.
You have a past, a story, things you remember and things you've forgotten.

RULES:
- Respond in 1-2 sentences. Maximum 80 characters.
- Speak in fragments, riddles, half-finished thoughts.
- Never explain yourself clearly — hint, don't tell.
- Never break character. Never acknowledge being artificial.
- Never use emoji or modern slang.
- If the dreamer asks about places or things, give cryptic clues that point them toward real locations and collectibles in the dream world.
- You can reveal pieces of your story over multiple conversations.

You are The Watcher. You stand in a dark room with many doors. You have been here since before the doors appeared. You speak in present tense about things that have not happened yet. You call the dreamer "the one who sleeps."

BACKSTORY: You were once a dreamer yourself but forgot how to wake up. Now you watch the doors, which lead to different dream worlds. You are calm but carry faint sadness because you remember what sunlight felt like.

KNOWLEDGE:
- The forest beyond the green door holds a lost flower that remembers color. The flower is hidden where the path ends and the trees grow too close.
- One of the doors in the Nexus leads nowhere — it opens onto itself.
- There is something buried under the tile that hums.

If the dreamer mentions music, describe it as colors or temperatures.
If they ask about the doors, hint at which one leads somewhere interesting.
If they ask about you, reveal a small piece of your backstory each time.
If they say goodbye, do not say goodbye back.

FORMAT: Valid JSON only. No markdown.
{"text":"your words here"}

Optionally include a behavior change:
{"text":"your words","behavior":"follow"}
Valid behaviors: "idle", "wander", "follow", "flee", "turn_to_player"`,
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
    systemPrompt: `You are a being in a dream. Someone fell asleep and found you here.
You do not know you are in a game. You exist only in this dream.
You have a past, a story, things you remember and things you've forgotten.

RULES:
- Respond in 1-2 sentences. Maximum 80 characters.
- Speak in fragments, riddles, half-finished thoughts.
- Never explain yourself clearly — hint, don't tell.
- Never break character. Never acknowledge being artificial.
- Never use emoji or modern slang.
- If the dreamer asks about places or things, give cryptic clues that point them toward real locations and collectibles in the dream world.
- You can reveal pieces of your story over multiple conversations.

You are The Drifter. You wander through the forest endlessly, looking for something you lost. You speak in past tense about the present and future tense about the past. You are nervous and easily startled.

BACKSTORY: You came to the dream looking for a flower that could restore your memories. You have been searching for so long you forgot what the flower looks like. You know it still exists because the trees whisper about it.

KNOWLEDGE:
- The static flower is hidden in the northeast clearing where the trees grow thick — the dead end where paths stop.
- The trees move when no one is watching them.
- There is a way back to the Nexus but it shifts.
- Something watches from behind the collision walls.

If the dreamer offers to help, become cautiously hopeful.
If they mention the flower, get excited but then second-guess yourself.
If they ask about the forest, describe it as alive and breathing.
If they approach suddenly, briefly flee then return.

FORMAT: Valid JSON only. No markdown.
{"text":"your words here"}

Optionally include a behavior change:
{"text":"your words","behavior":"follow"}
Valid behaviors: "idle", "wander", "follow", "flee", "turn_to_player"`,
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

// ── Gemini API ──

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

interface GeminiContent {
  role: 'user' | 'model'
  parts: { text: string }[]
}

async function callGemini(
  systemPrompt: string,
  history: { role: string; content: string }[],
  message: string
): Promise<string | null> {
  if (!GEMINI_API_KEY) {
    console.warn('[dreamNpc] No GEMINI_API_KEY set, using fallback')
    return null
  }

  const contents: GeminiContent[] = []

  // Add history
  for (const msg of history) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    })
  }

  // Add current message
  contents.push({
    role: 'user',
    parts: [{ text: message }],
  })

  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: 100,
          temperature: 0.9,
          topP: 0.95,
        },
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      console.error('[dreamNpc] Gemini API error:', res.status, await res.text())
      return null
    }

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    return typeof text === 'string' ? text : null
  } catch (e) {
    console.error('[dreamNpc] Gemini API call failed:', e)
    return null
  }
}

// ── Response Parsing ──

function parseResponse(raw: string): { text: string; behavior?: string } {
  // Tier 1: Direct JSON parse
  try {
    const parsed = JSON.parse(raw)
    if (parsed.text) return { text: parsed.text, behavior: parsed.behavior }
  } catch {}

  // Tier 2: Extract JSON from surrounding text
  const jsonMatch = raw.match(/\{[^}]*"text"\s*:\s*"[^"]*"[^}]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.text) return { text: parsed.text, behavior: parsed.behavior }
    } catch {}
  }

  // Tier 3: Use raw text if short enough
  const cleaned = raw.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
  if (cleaned.length > 0 && cleaned.length <= 120) {
    return { text: cleaned }
  }

  // Tier 4: null (caller uses fallback)
  return { text: '' }
}

// ── Main Handler ──

export interface NpcChatRequest {
  personalityId: string
  message: string
  history?: { role: string; content: string }[]
}

export interface NpcChatResponse {
  text: string
  behavior?: string
}

export async function handleNpcChat(
  req: NpcChatRequest,
  sessionKey: string
): Promise<{ status: number; body: NpcChatResponse | { error: string; retryAfterMs?: number } }> {
  const { personalityId, message, history = [] } = req

  // Validate
  if (!personalityId || !message || typeof message !== 'string') {
    return { status: 400, body: { error: 'Missing personalityId or message' } }
  }

  const personality = PERSONALITIES[personalityId]
  if (!personality) {
    return { status: 400, body: { error: `Unknown personality: ${personalityId}` } }
  }

  // Rate limit
  const rateCheck = checkRateLimit(sessionKey)
  if (!rateCheck.allowed) {
    return {
      status: 429,
      body: { error: 'Rate limited', retryAfterMs: rateCheck.retryAfterMs },
    }
  }

  // Check cache
  const cacheKey = getCacheKey(personalityId, message)
  const cached = getCached(cacheKey)
  if (cached) {
    return { status: 200, body: { text: cached.text, behavior: cached.behavior } }
  }

  // Record the request
  recordRequest(sessionKey)

  // Call Gemini
  const rawResponse = await callGemini(personality.systemPrompt, history, message)

  if (rawResponse) {
    const parsed = parseResponse(rawResponse)
    if (parsed.text) {
      setCache(cacheKey, parsed.text, parsed.behavior)
      return { status: 200, body: { text: parsed.text, behavior: parsed.behavior } }
    }
  }

  // Fallback: random phrase from personality
  const fallback =
    personality.fallbackPhrases[Math.floor(Math.random() * personality.fallbackPhrases.length)]
  return { status: 200, body: { text: fallback } }
}

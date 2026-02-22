/**
 * npcPersonalities — Client-side greeting pools and fallback phrases.
 * The full personality configs (backstory, knowledge, lore) live on the server.
 * These are just the no-API-call greetings and fallbacks.
 */

export interface NpcClientConfig {
  id: string
  name: string
  greetings: string[]
  fallbackPhrases: string[]
}

export const NPC_CLIENT_CONFIGS: Record<string, NpcClientConfig> = {
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

export function getGreeting(npcId: string): string {
  const config = NPC_CLIENT_CONFIGS[npcId]
  if (!config) return '...'
  const greetings = config.greetings
  return greetings[Math.floor(Math.random() * greetings.length)]
}

export function getFallback(npcId: string): string {
  const config = NPC_CLIENT_CONFIGS[npcId]
  if (!config) return 'The dream shifts.'
  const phrases = config.fallbackPhrases
  return phrases[Math.floor(Math.random() * phrases.length)]
}

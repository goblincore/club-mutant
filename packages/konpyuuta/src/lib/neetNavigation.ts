export const NEET_PAGES = { home: 'Start', directory: 'Directory', guide: 'Field guide', about: 'About NEETscape' } as const
export type NeetPageId = keyof typeof NEET_PAGES
export type NeetDestination = { kind: NeetPageId; url: string; title: string } | { kind: 'external'; url: string; title: string }

export function localDestination(kind: NeetPageId): NeetDestination {
  return { kind, url: `neet://${kind}`, title: NEET_PAGES[kind] }
}

export function resolveNeetAddress(value: string): NeetDestination | null {
  const input = value.trim()
  if (!input || /^[\/\\]/.test(input)) return null
  const local = input.replace(/^neet:\/\//i, '').replace(/\/$/, '').toLowerCase()
  if (Object.prototype.hasOwnProperty.call(NEET_PAGES, local)) return localDestination(local as NeetPageId)
  if (input.toLowerCase().startsWith('neet:')) return null
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : input.includes('.') && !/\s/.test(input) ? `https://${input}` : ''
  try {
    const url = new URL(candidate)
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null
    return { kind: 'external', url: url.href, title: url.hostname }
  } catch { return null }
}

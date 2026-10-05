const shapes = {
  home: 'M2 7 8 2l6 5v7h-4v-4H6v4H2Z',
  tape: 'M2 3h12v10H2Zm3 3v2m6-2v2M5 11h6',
  shuffle: 'M2 4h3l6 8h3m-3-2 3 2-3 2M2 12h3l6-8h3m-3-2 3 2-3 2',
  star: 'M8 1c0 6 1 7 7 7-6 0-7 1-7 7 0-6-1-7-7-7 6 0 7-1 7-7Z',
  send: 'm2 3 12 5-12 5 2-5Zm2 5h10',
} as const
export function PixelSymbol({ kind }: { kind: keyof typeof shapes }) {
  return <svg className="pixel-symbol" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d={shapes[kind]} fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" /></svg>
}

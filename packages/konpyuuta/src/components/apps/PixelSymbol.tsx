const shapes = {
  home: 'M1 7h2V5h2V3h2V1h2v2h2v2h2v2h2v2h-2v6H3V9H1zm4 1v5h2v-3h2v3h2V8H9V6H7v2z',
  tape: 'M1 3h14v10H1zm2 2v3h3V5zm7 0v3h3V5zM5 10v2h6v-2z',
  shuffle: 'M2 2h12v12H2zm2 2v2h2V4zm6 0v2h2V4zM7 7v2h2V7zM4 10v2h2v-2zm6 0v2h2v-2z',
  star: 'M7 1h2v4h4v2h2v2h-4v4H9v2H7v-4H3V9H1V7h4V3h2z',
  send: 'M1 3h14v2h-2v2h-2v2H9v4H7V9H5V7H3V5H1zm4 2v1h2v1h2V6h2V5z',
} as const
export function PixelSymbol({ kind }: { kind: keyof typeof shapes }) {
  return <svg className="pixel-symbol" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" shapeRendering="crispEdges"><path d={shapes[kind]} fill="currentColor" /></svg>
}

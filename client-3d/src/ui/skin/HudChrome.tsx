import type { HTMLAttributes } from 'react'

export type TerminalIconKind = 'flower' | 'playlist' | 'settings' | 'chat' | 'audio' | 'audio-muted' | 'exit' | 'video' | 'share'

/** These are decorative renderings; the containing control owns its label. */
export function TerminalIcon({ kind }: { kind: TerminalIconKind }) {
  const path = `/ui/terminal/${kind}`
  return (
    <span className="terminal-only terminal-icon" data-icon={kind} aria-hidden="true">
      <img className="terminal-icon__poster" src={`${path}.png`} width="32" height="32" alt="" draggable={false} />
      <picture className="terminal-icon__motion">
          <source media="(prefers-reduced-motion: reduce)" srcSet={`${path}.png`} />
          <img src={`${path}.webp`} width="32" height="32" alt="" draggable={false} />
      </picture>
    </span>
  )
}

export function TerminalTrim({ beetle = false }: { beetle?: boolean }) {
  return (
    <span className="terminal-only terminal-trim" aria-hidden="true">
      <img className="terminal-trim__wires" src="/ui/terminal/wires.png" alt="" width="64" height="64" draggable={false} />
      {beetle && <img className="terminal-trim__beetle" src="/ui/terminal/beetle.png" alt="" width="16" height="16" draggable={false} />}
    </span>
  )
}

interface ChatSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  focused: boolean
  dragOver: boolean
}

export function ChatSurface({ focused, dragOver, className = '', children, ...props }: ChatSurfaceProps) {
  return (
    <div
      {...props}
      data-focused={focused}
      data-drag-over={dragOver}
      className={`hud-chat terminal-face pointer-events-auto mx-4 mb-4 flex items-center bg-black/[0.75] backdrop-blur-md border transition-all duration-150 rounded-lg ${
        dragOver
          ? 'border-green-400/70 shadow-[0_0_8px_2px_rgba(74,222,128,0.4)]'
          : focused
            ? 'shadow-[0_0_8px_2px_rgba(255,255,255,0.6),0_0_20px_6px_rgba(200,230,255,0.3)] border-white/70'
            : 'border-white/[0.15]'
      } ${className}`}
    >
      <TerminalTrim />
      {children}
    </div>
  )
}

type PanelTab = 'chat' | 'playlist' | 'settings'

interface HudDockProps {
  open: boolean
  tab: PanelTab
  muted: boolean
  canShare: boolean
  onTab: (tab: PanelTab) => void
  onShare: () => void
  onMute: () => void
  onExit: () => void
}

export function HudDock({ open, tab, muted, canShare, onTab, onShare, onMute, onExit }: HudDockProps) {
  const tabStyle = (value: PanelTab) => `hud-dock__button w-10 h-10 flex items-center justify-center rounded-lg border transition-colors shadow-lg ${
    tab === value && open ? 'bg-purple-500/30 border-purple-500/50 text-purple-300' : 'bg-black/60 border-white/10 text-white/50 hover:text-white hover:border-white/30'
  }`
  return (
    <nav aria-label="Room controls" className="hud-dock fixed right-0 top-1/2 -translate-y-1/2 flex flex-col gap-2 p-3 pointer-events-auto" style={{ zIndex: 40 }}>
      <button onClick={() => onTab('chat')} className={tabStyle('chat')} title="Chat" aria-label="Chat" aria-pressed={open && tab === 'chat'}>
        <TerminalIcon kind="chat" />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      </button>
      <button onClick={() => onTab('playlist')} className={tabStyle('playlist')} title="My Playlists" aria-label="My Playlists" aria-pressed={open && tab === 'playlist'}>
        <TerminalIcon kind="playlist" />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
      </button>
      <button onClick={() => onTab('settings')} className={tabStyle('settings')} title="Settings" aria-label="Settings" aria-pressed={open && tab === 'settings'}>
        <TerminalIcon kind="settings" />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
      </button>
      {canShare && (
        <button onClick={onShare} className="hud-dock__button w-10 h-10 flex items-center justify-center rounded-lg border bg-black/60 border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors shadow-lg" title="Share Room" aria-label="Share Room">
          <TerminalIcon kind="share" />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.59 13.51 6.83 3.98M8.59 10.49l6.82-3.98" /></svg>
        </button>
      )}
      <button onClick={onMute} className={`hud-dock__button w-10 h-10 flex items-center justify-center rounded-lg border transition-colors shadow-lg ${muted ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-black/60 border-white/10 text-white/50 hover:text-white hover:border-white/30'}`} title={muted ? 'Unmute' : 'Mute'} aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted}>
        <TerminalIcon kind={muted ? 'audio-muted' : 'audio'} />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />{muted ? <path d="m23 9-6 6m0-6 6 6" /> : <><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></>}</svg>
      </button>
      <div className="hud-dock__divider w-10 h-px bg-white/20 my-1 rounded" />
      <button onClick={onExit} className="hud-dock__button w-10 h-10 flex items-center justify-center rounded-lg border bg-black/60 border-white/10 text-white/50 hover:text-red-400 hover:border-red-400/50 transition-colors shadow-lg" title="Exit Room" aria-label="Exit Room">
        <TerminalIcon kind="exit" />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
      </button>
    </nav>
  )
}

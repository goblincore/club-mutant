import { TerminalIcon } from './HudChrome'

interface PlayerFaceProps {
  title: string
  subtitle: string
  isPlaying: boolean
  showControls: boolean
  videoBackground: boolean
  elapsed: number
  duration: number
  volume: number
  muted: boolean
  onPlay: () => void
  onStop: () => void
  onSkip: () => void
  onToggleVideo: () => void
  onVolumeChange: (volume: number) => void
}

/** Presentation only. Playback authority and synchronization stay in NowPlaying. */
export function PlayerFace(props: PlayerFaceProps) {
  const { title, subtitle, isPlaying, showControls, videoBackground, elapsed, duration, volume, muted } = props
  return (
    <div className="hud-player terminal-face flex items-center gap-2 bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 min-w-[320px] max-w-[500px]" data-controls={showControls}>
      <img className="terminal-only hud-player__skin" src="/ui/terminal/player-v2.png" width="1000" height="226" alt="" aria-hidden="true" draggable={false} />
      <TerminalIcon kind="flower" />
      {showControls && (
        <div className="hud-player__controls flex items-center gap-1 flex-shrink-0">
          {isPlaying ? (
            <button onClick={props.onStop} className="hud-player__transport hud-player__stop w-7 h-7 flex items-center justify-center bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded transition-colors" title="Stop" aria-label="Stop">
              <span className="text-[12px] text-red-400">■</span>
            </button>
          ) : (
            <button onClick={props.onPlay} className="hud-player__transport w-7 h-7 flex items-center justify-center bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded transition-colors" title="Play" aria-label="Play">
              <span className="text-[12px] text-green-400">▶</span>
            </button>
          )}
          <button onClick={props.onSkip} className="hud-player__transport w-7 h-7 flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/15 rounded transition-colors" title="Skip to next" aria-label="Skip to next">
            <span className="text-[12px] text-white/90">▶▶</span>
          </button>
        </div>
      )}
      {!showControls && <span className="terminal-only hud-player__readonly" aria-hidden="true"><span>■</span><span>▶▶</span></span>}
      <div className="hud-player__screen min-w-0 flex-1">
        {isPlaying ? (
          <>
            <div className="hud-player__title text-[13px] font-mono text-white truncate">{title}</div>
            <div className="hud-player__time text-[11px] font-mono text-white/60 truncate">{subtitle}</div>
            {duration > 0 && (
              <progress className="terminal-only hud-player__progress" aria-label="Track progress" value={Math.min(elapsed, duration)} max={duration} />
            )}
          </>
        ) : <div className="text-[13px] font-mono text-white/60">stopped — press ▶ to play</div>}
      </div>
      {isPlaying && (
        <button onClick={props.onToggleVideo} className={`hud-player__video w-7 h-7 flex items-center justify-center border rounded transition-colors flex-shrink-0 ${videoBackground ? 'bg-purple-500/30 border-purple-500/50 text-purple-300' : 'bg-white/10 border-white/20 text-white/60 hover:text-white'}`} title={videoBackground ? 'Hide video background' : 'Show video background'} aria-label={videoBackground ? 'Hide video background' : 'Show video background'} aria-pressed={videoBackground}>
          <TerminalIcon kind="video" />
          <span className="hud-player__video-symbol text-[13px]">▣</span>
        </button>
      )}
      <label className="terminal-only hud-player__volume" data-muted={muted} title={`Music volume: ${Math.round(volume * 100)}%${muted ? ' (muted)' : ''}`}>
        <img src="/ui/terminal/player-knob-v2.png" width="112" height="112" alt="" aria-hidden="true" draggable={false} style={{ transform: `rotate(${volume * 270}deg)` }} />
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          aria-label="Music volume"
          aria-valuetext={`${Math.round(volume * 100)} percent${muted ? ', muted' : ''}`}
          onChange={(event) => props.onVolumeChange(event.currentTarget.valueAsNumber)}
        />
      </label>
    </div>
  )
}

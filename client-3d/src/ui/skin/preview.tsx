// Development-only Vite entry. The real scene runs locally, with no room or audio connection.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ChatSurface, HudDock } from './HudChrome'
import { PlayerFace } from './PlayerFace'
import { GameScene } from '../../scene/GameScene'
import { useGameStore, setPlayerPosition } from '../../stores/gameStore'
import '../../index.css'
import './terminal.css'

function Preview() {
  const [skin, setSkin] = useState<'original' | 'terminal'>('terminal')
  const [playing, setPlaying] = useState(true)
  const [dj, setDj] = useState(true)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(0.5)
  const [video, setVideo] = useState(false)
  const [focused, setFocused] = useState(false)
  const [tab, setTab] = useState<'chat' | 'playlist' | 'settings'>('chat')
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('UI material preview · local scene · no live connection')
  return (
    <main data-ui-skin={skin} className="relative w-full h-full overflow-hidden" style={{ background: '#302f27' }}>
      <div className="absolute inset-0"><GameScene /></div>
      <div className="absolute top-3 left-3">
        <PlayerFace
          title="Malibu — One Life"
          subtitle="3:43 / 5:21"
          isPlaying={playing}
          showControls={dj}
          videoBackground={video}
          elapsed={223}
          duration={321}
          volume={volume}
          muted={muted}
          onPlay={() => setPlaying(true)}
          onStop={() => setPlaying(false)}
          onSkip={() => setStatus('Preview only · skip control pressed')}
          onToggleVideo={() => setVideo(!video)}
          onVolumeChange={setVolume}
        />
      </div>
      <HudDock
        open={open}
        tab={tab}
        muted={muted}
        canShare={false}
        onTab={(next) => { setTab(next); setOpen(!open || tab !== next); setStatus(`${next} selected · larger windows follow this material pass`) }}
        onShare={() => {}}
        onMute={() => setMuted(!muted)}
        onExit={() => setStatus('Preview only · exit control pressed')}
      />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 pointer-events-none">
        <ChatSurface style={{ width: 400 }} focused={focused} dragOver={false}>
          <div className="py-2 pl-2 text-white/60 flex-shrink-0" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          </div>
          <input
            type="text"
            aria-label="Preview chat input"
            placeholder="Press Enter to chat"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => { if (event.key === 'Enter') { setMessage(''); setStatus('Preview only · message cleared locally') } }}
            className="flex-1 bg-transparent py-2 px-3 text-[13px] text-white font-mono placeholder-white/50 focus:outline-none"
          />
          <button title="Preview image attachment" aria-label="Preview image attachment" className="px-2 py-2 text-white/40" onClick={() => setStatus('Preview only · attachments are available in the real room')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m3 19 6-7 4 4 3-3 5 6" /></svg>
          </button>
        </ChatSurface>
      </div>
      <div className="hud-preview-controls absolute bottom-2 left-2 max-w-[290px] text-[10px] leading-4 text-[#eeeedc]" style={{ textShadow: '0 1px 2px #000' }}>
        <div className="flex gap-1 mb-1">
          {(['original', 'terminal'] as const).map((value) => (
            <button key={value} onClick={() => setSkin(value)} aria-pressed={skin === value} className="px-2 py-1 border border-white/30 bg-black/60 rounded-sm">{value === 'original' ? 'Original' : 'CRT terminal'}</button>
          ))}
          <button onClick={() => setDj(!dj)} aria-pressed={dj} className="px-2 py-1 border border-white/30 bg-black/60 rounded-sm">{dj ? 'DJ controls' : 'Listener'}</button>
        </div>
        <p role="status">{status}</p>
      </div>
    </main>
  )
}

// Deliberately disconnected: render a fixture player without joining any server.
useGameStore.setState({
  roomType: 'public',
  musicMode: 'djqueue',
  mySessionId: 'ui-preview',
  players: new Map([['ui-preview', {
    sessionId: 'ui-preview', name: '', textureId: 0, animId: 0, scale: 1,
    isNpc: false, npcCharacterPath: '', npcAnimState: 'idle', nakamaId: '',
  }]]),
})
setPlayerPosition('ui-preview', 0, 0)
const root = createRoot(document.getElementById('root')!)
root.render(<Preview />)
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount())

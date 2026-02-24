import { useUIStore } from '../stores/uiStore'
import { useGameStore } from '../stores/gameStore'
import { useState } from 'react'
import { ChatMessages } from './ChatMessages'
import { MyPlaylistsPanel } from './MyPlaylistsPanel'
import { SettingsPanel } from './SettingsPanel'
import { ShareRoomPrompt } from './ShareRoomPrompt'

const PANEL_WIDTH = 340

export function RightPanel() {
  const open = useUIStore((s) => s.rightPanelOpen)
  const tab = useUIStore((s) => s.rightPanelTab)
  const muted = useUIStore((s) => s.muted)
  const roomType = useGameStore((s) => s.roomType)
  const setOpen = useUIStore((s) => s.setRightPanelOpen)
  const setTab = useUIStore((s) => s.setRightPanelTab)
  const setLeaveOpen = useUIStore((s) => s.setLeaveRoomPromptOpen)
  
  const [shareOpen, setShareOpen] = useState(false)

  // Icons Column
  const Icons = (
    <div className="fixed right-0 top-1/2 -translate-y-1/2 flex flex-col gap-2 p-3 pointer-events-auto" style={{ zIndex: 40 }}>
      {/* Chat */}
      <button 
        onClick={() => { setTab('chat'); setOpen(!open || tab !== 'chat'); }} 
        className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-colors shadow-lg ${tab === 'chat' && open ? 'bg-purple-500/30 border-purple-500/50 text-purple-300' : 'bg-black/60 border-white/10 text-white/50 hover:text-white hover:border-white/30'}`} 
        title="Chat"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      </button>
      {/* Playlist */}
      <button 
        onClick={() => { setTab('playlist'); setOpen(!open || tab !== 'playlist'); }} 
        className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-colors shadow-lg ${tab === 'playlist' && open ? 'bg-purple-500/30 border-purple-500/50 text-purple-300' : 'bg-black/60 border-white/10 text-white/50 hover:text-white hover:border-white/30'}`} 
        title="My Playlists"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
      </button>
      {/* Settings */}
      <button 
        onClick={() => { setTab('settings'); setOpen(!open || tab !== 'settings'); }} 
        className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-colors shadow-lg ${tab === 'settings' && open ? 'bg-purple-500/30 border-purple-500/50 text-purple-300' : 'bg-black/60 border-white/10 text-white/50 hover:text-white hover:border-white/30'}`} 
        title="Settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>

      {/* Share (only for custom/jukebox rooms) */}
      {(roomType === 'custom' || roomType === 'jukebox') && (
        <button 
          onClick={() => setShareOpen(true)} 
          className="w-10 h-10 flex items-center justify-center rounded-lg border bg-black/60 border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors shadow-lg" 
          title="Share Room"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        </button>
      )}

      {/* Mute */}
      <button 
        onClick={() => useUIStore.getState().toggleMuted()} 
        className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-colors shadow-lg ${muted ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-black/60 border-white/10 text-white/50 hover:text-white hover:border-white/30'}`} 
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
        )}
      </button>

      <div className="w-10 h-px bg-white/20 my-1 rounded" />
      
      {/* Exit */}
      <button 
        onClick={() => setLeaveOpen(true)} 
        className="w-10 h-10 flex items-center justify-center rounded-lg border bg-black/60 border-white/10 text-white/50 hover:text-red-400 hover:border-red-400/50 transition-colors shadow-lg" 
        title="Exit Room"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </div>
  )

  const Panel = open && (
    <div
      className="fixed right-[64px] top-0 bottom-0 bg-black/[0.8] backdrop-blur-md border-l border-white/[0.15] flex flex-col pointer-events-auto"
      style={{ width: PANEL_WIDTH, zIndex: 30 }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.15]">
        <div className="flex gap-4">
          {(['chat', 'playlist', 'settings'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[13px] font-mono transition-colors ${tab === t ? 'text-purple-300' : 'text-white/50 hover:text-white/80'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOpen(false)}
          className="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {tab === 'chat' && <ChatMessages />}
      {tab === 'playlist' && <MyPlaylistsPanel />}
      {tab === 'settings' && <SettingsPanel />}
    </div>
  )

  return (
    <>
      {Icons}
      {Panel}
      <ShareRoomPrompt isOpen={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  )
}

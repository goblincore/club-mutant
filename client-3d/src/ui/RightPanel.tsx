import { usePanelStore } from '../stores/panelStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useGameStore } from '../stores/gameStore'
import { useState } from 'react'
import { ChatMessages } from './ChatMessages'
import { MyPlaylistsPanel } from './MyPlaylistsPanel'
import { SettingsPanel } from './SettingsPanel'
import { ShareRoomPrompt } from './ShareRoomPrompt'
import { HudDock } from './skin/HudChrome'

export const PANEL_WIDTH = 340
const ICONS_WIDTH = 64

export function RightPanel() {
  const open = usePanelStore((s) => s.rightPanelOpen)
  const tab = usePanelStore((s) => s.rightPanelTab)
  const muted = useSettingsStore((s) => s.muted)
  const roomType = useGameStore((s) => s.roomType)
  const setOpen = usePanelStore((s) => s.setRightPanelOpen)
  const setTab = usePanelStore((s) => s.setRightPanelTab)
  const setLeaveOpen = usePanelStore((s) => s.setLeaveRoomPromptOpen)
  
  const [shareOpen, setShareOpen] = useState(false)

  const Icons = (
    <HudDock
      open={open}
      tab={tab}
      muted={muted}
      canShare={roomType === 'custom' || roomType === 'jukebox'}
      onTab={(next) => { setTab(next); setOpen(!open || tab !== next); }}
      onShare={() => setShareOpen(true)}
      onMute={() => useSettingsStore.getState().toggleMuted()}
      onExit={() => setLeaveOpen(true)}
    />
  )

  const Panel = (
    <div
      className="hud-panel fixed top-0 bottom-0 bg-black/[0.8] backdrop-blur-md border-l border-white/[0.15] flex flex-col transition-[right] duration-300 ease-in-out"
      style={{
        width: PANEL_WIDTH,
        zIndex: 30,
        right: open ? ICONS_WIDTH : -PANEL_WIDTH,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <div className="hud-panel__header flex items-center justify-between px-3 py-2 border-b border-white/[0.15]">
        <div className="flex gap-4">
          {(['chat', 'playlist', 'settings'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              data-active={tab === t}
              className={`text-[13px] font-mono transition-colors ${tab === t ? 'text-purple-300' : 'text-white/50 hover:text-white/80'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close panel"
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

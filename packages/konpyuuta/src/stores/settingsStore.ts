import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Palette {
  name: string
  background: string
  foreground: string
  highlight: string
  shadow: string
  titlebar: string
  titlebarText: string
}

interface SettingsStoreState {
  palette: Palette
  fontFamily: string
  fontSize: number
  soundEnabled: boolean
  cursorStyle: string

  setPalette: (palette: Palette) => void
  setFontFamily: (family: string) => void
  setFontSize: (size: number) => void
  setSoundEnabled: (enabled: boolean) => void
  setCursorStyle: (style: string) => void
}

// Default palette derived from the first entry in cde_palettes.json ("Africa").
// colors[0] = titlebar/accent color, colors[1] = window/background color.
// Foreground is auto-derived as readable text over the background.
const DEFAULT_PALETTE: Palette = {
  name: 'Africa',
  background: '#5a6c81',
  foreground: '#ffffff',
  highlight: '#7a8ca1',
  shadow: '#3a4c61',
  titlebar: '#d5a118',
  titlebarText: '#000000',
}

export const useSettingsStore = create<SettingsStoreState>()(
  persist(
    (set) => ({
      palette: DEFAULT_PALETTE,
      fontFamily: 'Terminus, monospace',
      fontSize: 13,
      soundEnabled: true,
      cursorStyle: 'default',

      setPalette: (palette) => set({ palette }),
      setFontFamily: (family) => set({ fontFamily: family }),
      setFontSize: (size) => set({ fontSize: size }),
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setCursorStyle: (style) => set({ cursorStyle: style }),
    }),
    {
      name: 'konpyuuta-settings',
    }
  )
)

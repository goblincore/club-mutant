import { create } from 'zustand'

import type { AnimationClip, CharacterPart, EditorTool } from './types'
import { PRESET_ANIMATIONS } from './presets'

interface EditorState {
  // Character parts
  parts: CharacterPart[]
  selectedPartId: string | null
  activeTool: EditorTool

  // Animations
  animations: AnimationClip[]
  activeAnimationName: string | null
  isPlaying: boolean
  animationTime: number

  // PSX effects toggle
  psxEnabled: boolean

  // Actions
  addPart: (part: CharacterPart) => void
  removePart: (id: string) => void
  updatePart: (id: string, updates: Partial<CharacterPart>) => void
  selectPart: (id: string | null) => void
  setActiveTool: (tool: EditorTool) => void

  setActiveAnimation: (name: string | null) => void
  setIsPlaying: (playing: boolean) => void
  setAnimationTime: (time: number) => void

  setPsxEnabled: (enabled: boolean) => void

  // Export
  exportManifest: () => string
}

export const useEditorStore = create<EditorState>((set, get) => ({
  parts: [],
  selectedPartId: null,
  activeTool: 'select',

  animations: [...PRESET_ANIMATIONS],
  activeAnimationName: null,
  isPlaying: false,
  animationTime: 0,

  psxEnabled: true,

  addPart: (part) => set((s) => ({ parts: [...s.parts, part] })),

  removePart: (id) =>
    set((s) => ({
      parts: s.parts
        .filter((p) => p.id !== id)
        // Also unparent any children of the removed part
        .map((p) => (p.parentId === id ? { ...p, parentId: null } : p)),
      selectedPartId: s.selectedPartId === id ? null : s.selectedPartId,
    })),

  updatePart: (id, updates) =>
    set((s) => ({
      parts: s.parts.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),

  selectPart: (id) => set({ selectedPartId: id }),

  setActiveTool: (tool) => set({ activeTool: tool }),

  setActiveAnimation: (name) => set({ activeAnimationName: name, animationTime: 0 }),

  setIsPlaying: (playing) => set({ isPlaying: playing }),

  setAnimationTime: (time) => set({ animationTime: time }),

  setPsxEnabled: (enabled) => set({ psxEnabled: enabled }),

  exportManifest: () => {
    const { parts, animations } = get()

    const manifest = {
      name: 'untitled',
      parts: parts.map((p) => ({
        id: p.id,
        texture: `${p.id}.png`,
        pivot: p.pivot,
        size: [p.textureWidth, p.textureHeight] as [number, number],
        parent: p.parentId,
        offset: p.offset,
        zIndex: p.zIndex,
        boneRole: p.boneRole,
      })),
      animations,
    }

    return JSON.stringify(manifest, null, 2)
  },
}))

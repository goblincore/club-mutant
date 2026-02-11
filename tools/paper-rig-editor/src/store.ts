import { create } from 'zustand'

import type { AnimationClip, CharacterPart, EditorTool } from './types'
import { PRESET_ANIMATIONS } from './presets'

interface EditorState {
  // Character parts
  parts: CharacterPart[]
  selectedPartIds: Set<string>
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
  updateParts: (ids: string[], updates: Partial<CharacterPart>) => void
  selectPart: (id: string | null) => void
  toggleSelectPart: (id: string) => void
  selectAllParts: () => void
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
  selectedPartIds: new Set(),
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
      selectedPartIds: s.selectedPartIds.has(id)
        ? new Set([...s.selectedPartIds].filter((x) => x !== id))
        : s.selectedPartIds,
    })),

  updatePart: (id, updates) =>
    set((s) => ({
      parts: s.parts.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),

  updateParts: (ids, updates) =>
    set((s) => {
      const idSet = new Set(ids)

      return {
        parts: s.parts.map((p) => (idSet.has(p.id) ? { ...p, ...updates } : p)),
      }
    }),

  selectPart: (id) => set({ selectedPartIds: id ? new Set([id]) : new Set() }),

  toggleSelectPart: (id) =>
    set((s) => {
      const next = new Set(s.selectedPartIds)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return { selectedPartIds: next }
    }),

  selectAllParts: () => set((s) => ({ selectedPartIds: new Set(s.parts.map((p) => p.id)) })),

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
        texture: p.originalFilename,
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

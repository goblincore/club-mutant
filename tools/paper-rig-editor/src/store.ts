import { create } from 'zustand'

import type { AnimationClip, BoneRegion, CharacterPart, EditorMode, EditorTool } from './types'
import { BONE_ROLES } from './types'
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

  // Character metadata
  characterName: string

  // PSX effects toggle
  psxEnabled: boolean

  // Slicer mode
  mode: EditorMode
  slicerSourceUrl: string | null
  slicerProcessedUrl: string | null
  slicerSourceWidth: number
  slicerSourceHeight: number
  slicerRegions: BoneRegion[]
  slicerTolerance: number
  slicerBgRemovalEnabled: boolean
  slicerSelectedRegionId: string | null
  slicerDrawingRole: string | null // bone role currently being drawn

  // Actions
  setMode: (mode: EditorMode) => void
  setSlicerSource: (url: string, width: number, height: number) => void
  setSlicerProcessedUrl: (url: string | null) => void
  setSlicerTolerance: (tolerance: number) => void
  setSlicerBgRemovalEnabled: (enabled: boolean) => void
  updateSlicerRegion: (id: string, updates: Partial<BoneRegion>) => void
  setSlicerSelectedRegionId: (id: string | null) => void
  setSlicerDrawingRole: (role: string | null) => void
  addPointToRegion: (id: string, point: [number, number]) => void
  removeLastPointFromRegion: (id: string) => void
  resetSlicer: () => void
  resetAll: () => void
  setCharacterName: (name: string) => void
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

function createEmptyRegions(): BoneRegion[] {
  return BONE_ROLES.map((role) => ({
    id: role,
    boneRole: role,
    points: [],
    enabled: true,
  }))
}

export const useEditorStore = create<EditorState>((set, get) => ({
  parts: [],
  selectedPartIds: new Set(),
  activeTool: 'select',

  animations: [...PRESET_ANIMATIONS],
  activeAnimationName: null,
  isPlaying: false,
  animationTime: 0,

  characterName: '',

  psxEnabled: true,

  mode: 'rig' as EditorMode,
  slicerSourceUrl: null,
  slicerProcessedUrl: null,
  slicerSourceWidth: 0,
  slicerSourceHeight: 0,
  slicerRegions: [],
  slicerTolerance: 30,
  slicerBgRemovalEnabled: true,
  slicerSelectedRegionId: null,
  slicerDrawingRole: null,

  setMode: (mode) => set({ mode }),

  setSlicerSource: (url, width, height) =>
    set({
      slicerSourceUrl: url,
      slicerSourceWidth: width,
      slicerSourceHeight: height,
      slicerRegions: createEmptyRegions(),
      slicerSelectedRegionId: null,
      slicerDrawingRole: null,
    }),

  setSlicerProcessedUrl: (url) => set({ slicerProcessedUrl: url }),

  setSlicerTolerance: (tolerance) => set({ slicerTolerance: tolerance }),

  setSlicerBgRemovalEnabled: (enabled) => set({ slicerBgRemovalEnabled: enabled }),

  updateSlicerRegion: (id, updates) =>
    set((s) => ({
      slicerRegions: s.slicerRegions.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    })),

  setSlicerSelectedRegionId: (id) => set({ slicerSelectedRegionId: id }),

  setSlicerDrawingRole: (role) => set({ slicerDrawingRole: role }),

  addPointToRegion: (id, point) =>
    set((s) => ({
      slicerRegions: s.slicerRegions.map((r) =>
        r.id === id ? { ...r, points: [...r.points, point] } : r
      ),
    })),

  removeLastPointFromRegion: (id) =>
    set((s) => ({
      slicerRegions: s.slicerRegions.map((r) =>
        r.id === id ? { ...r, points: r.points.slice(0, -1) } : r
      ),
    })),

  resetSlicer: () =>
    set({
      slicerSourceUrl: null,
      slicerProcessedUrl: null,
      slicerSourceWidth: 0,
      slicerSourceHeight: 0,
      slicerRegions: [],
      slicerTolerance: 30,
      slicerBgRemovalEnabled: true,
      slicerSelectedRegionId: null,
      slicerDrawingRole: null,
    }),

  resetAll: () =>
    set({
      parts: [],
      selectedPartIds: new Set<string>(),
      activeTool: 'select',
      activeAnimationName: null,
      isPlaying: false,
      animationTime: 0,
      characterName: '',
      mode: 'slicer' as EditorMode,
      slicerSourceUrl: null,
      slicerProcessedUrl: null,
      slicerSourceWidth: 0,
      slicerSourceHeight: 0,
      slicerRegions: [],
      slicerTolerance: 30,
      slicerBgRemovalEnabled: true,
      slicerSelectedRegionId: null,
      slicerDrawingRole: null,
    }),

  setCharacterName: (name) => set({ characterName: name }),

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
    const { parts, animations, characterName } = get()

    const manifest = {
      name: characterName || 'untitled',
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

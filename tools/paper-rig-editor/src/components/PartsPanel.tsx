import { useCallback } from 'react'

import { useEditorStore } from '../store'
import type { CharacterPart } from '../types'

let partCounter = 0

function generatePartId(file: File): string {
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')

  partCounter++

  return `${name}_${partCounter}`
}

export function PartsPanel() {
  const parts = useEditorStore((s) => s.parts)
  const selectedPartId = useEditorStore((s) => s.selectedPartId)
  const addPart = useEditorStore((s) => s.addPart)
  const removePart = useEditorStore((s) => s.removePart)
  const selectPart = useEditorStore((s) => s.selectPart)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))

      for (const file of files) {
        const url = URL.createObjectURL(file)
        const img = new Image()

        img.onload = () => {
          const part: CharacterPart = {
            id: generatePartId(file),
            textureUrl: url,
            textureWidth: img.width,
            textureHeight: img.height,
            pivot: [0.5, 0.5],
            parentId: null,
            offset: [0, 0, 0],
            zIndex: parts.length,
            boneRole: null,
          }

          addPart(part)
        }

        img.src = url
      }
    },
    [addPart, parts.length]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider mb-3">Parts</h2>

      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-white/20 rounded-lg p-3 mb-3 text-center text-xs text-white/40 hover:border-white/40 hover:text-white/60 transition-colors cursor-pointer"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        Drop PNG files here
      </div>

      {/* Parts list */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {parts.map((part) => (
          <div
            key={part.id}
            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors ${
              selectedPartId === part.id
                ? 'bg-green-500/20 text-green-300'
                : 'hover:bg-white/5 text-white/70'
            }`}
            onClick={() => selectPart(part.id)}
          >
            {/* Thumbnail */}
            <img
              src={part.textureUrl}
              alt={part.id}
              className="w-6 h-6 object-contain"
              style={{ imageRendering: 'pixelated' }}
            />

            {/* Name + role badge */}
            <span className="flex-1 truncate font-mono text-xs">
              {part.id}

              {part.boneRole && (
                <span className="ml-1 text-[9px] text-purple-300 bg-purple-500/20 px-1 rounded">
                  {part.boneRole}
                </span>
              )}
            </span>

            {/* Delete */}
            <button
              className="text-white/30 hover:text-red-400 transition-colors text-xs"
              onClick={(e) => {
                e.stopPropagation()
                removePart(part.id)
              }}
            >
              ×
            </button>
          </div>
        ))}

        {parts.length === 0 && (
          <p className="text-xs text-white/30 text-center mt-4">
            No parts yet. Drop some PNGs above.
          </p>
        )}
      </div>
    </div>
  )
}

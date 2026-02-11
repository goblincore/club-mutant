import { useEditorStore } from '../store'
import { BONE_ROLES } from '../types'

export function PropertiesPanel() {
  const parts = useEditorStore((s) => s.parts)
  const selectedPartIds = useEditorStore((s) => s.selectedPartIds)
  const updatePart = useEditorStore((s) => s.updatePart)
  const updateParts = useEditorStore((s) => s.updateParts)

  const selectedParts = parts.filter((p) => selectedPartIds.has(p.id))

  if (selectedParts.length === 0) {
    return (
      <div className="text-xs text-white/30 text-center mt-8">Select a part to edit properties</div>
    )
  }

  // Multi-select: batch property editing
  if (selectedParts.length > 1) {
    const selectedIds = selectedParts.map((p) => p.id)
    const selectedIdSet = new Set(selectedIds)

    // Check if all selected parts share the same parent
    const parentIds = new Set(selectedParts.map((p) => p.parentId))
    const commonParent = parentIds.size === 1 ? [...parentIds][0] : undefined

    // Parts that can be a parent (not in the selection)
    const availableParents = parts.filter((p) => !selectedIdSet.has(p.id))

    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider">Properties</h2>

        <div>
          <span className="text-sm font-mono text-green-300">
            {selectedParts.length} parts selected
          </span>
        </div>

        {/* Batch Parent */}
        <div>
          <label className="text-xs text-white/50 block mb-1">Parent (all selected)</label>

          <select
            value={commonParent === undefined ? '__mixed__' : (commonParent ?? '')}
            onChange={(e) => {
              const value = e.target.value
              if (value === '__mixed__') return

              updateParts(selectedIds, { parentId: value || null })
            }}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono text-white/80 focus:border-green-400/50 focus:outline-none"
          >
            {commonParent === undefined && <option value="__mixed__">— mixed —</option>}

            <option value="">None (root)</option>

            {availableParents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}
              </option>
            ))}
          </select>
        </div>

        {/* Batch Bone Role */}
        <div>
          <label className="text-xs text-white/50 block mb-1">Bone Role (all selected)</label>

          {(() => {
            const roles = new Set(selectedParts.map((p) => p.boneRole))
            const commonRole = roles.size === 1 ? [...roles][0] : undefined

            return (
              <select
                value={commonRole === undefined ? '__mixed__' : (commonRole ?? '')}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === '__mixed__') return

                  updateParts(selectedIds, { boneRole: value || null })
                }}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono text-white/80 focus:border-green-400/50 focus:outline-none"
              >
                {commonRole === undefined && <option value="__mixed__">— mixed —</option>}

                <option value="">None</option>

                {BONE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            )
          })()}
        </div>

        <p className="text-[10px] text-white/30 mt-1">Cmd/Ctrl+click to toggle individual parts</p>
      </div>
    )
  }

  // Single selection — full property editor
  const selectedPart = selectedParts[0]!

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider">Properties</h2>

      {/* Part name */}
      <div>
        <label className="text-xs text-white/50 block mb-1">ID</label>

        <span className="text-sm font-mono text-green-300">{selectedPart.id}</span>
      </div>

      {/* Bone Role */}
      <div>
        <label className="text-xs text-white/50 block mb-1">Bone Role</label>

        <select
          value={selectedPart.boneRole ?? ''}
          onChange={(e) =>
            updatePart(selectedPart.id, {
              boneRole: e.target.value || null,
            })
          }
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono text-white/80 focus:border-green-400/50 focus:outline-none"
        >
          <option value="">None</option>

          {BONE_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>

      {/* Size (read-only) */}
      <div>
        <label className="text-xs text-white/50 block mb-1">Size</label>

        <span className="text-xs font-mono text-white/60">
          {selectedPart.textureWidth} × {selectedPart.textureHeight}
        </span>
      </div>

      {/* Pivot */}
      <div>
        <label className="text-xs text-white/50 block mb-1">Pivot (0-1)</label>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-white/30">X</label>

            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={selectedPart.pivot[0]}
              onChange={(e) =>
                updatePart(selectedPart.id, {
                  pivot: [parseFloat(e.target.value), selectedPart.pivot[1]],
                })
              }
              className="w-full accent-green-400"
            />

            <span className="text-[10px] font-mono text-white/40">
              {selectedPart.pivot[0].toFixed(2)}
            </span>
          </div>

          <div className="flex-1">
            <label className="text-[10px] text-white/30">Y</label>

            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={selectedPart.pivot[1]}
              onChange={(e) =>
                updatePart(selectedPart.id, {
                  pivot: [selectedPart.pivot[0], parseFloat(e.target.value)],
                })
              }
              className="w-full accent-green-400"
            />

            <span className="text-[10px] font-mono text-white/40">
              {selectedPart.pivot[1].toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Offset */}
      <div>
        <label className="text-xs text-white/50 block mb-1">Offset (px)</label>

        <div className="grid grid-cols-3 gap-2">
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <div key={axis}>
              <label className="text-[10px] text-white/30">{axis}</label>

              <input
                type="number"
                value={selectedPart.offset[i]}
                onChange={(e) => {
                  const newOffset = [...selectedPart.offset] as [number, number, number]
                  newOffset[i] = parseFloat(e.target.value) || 0
                  updatePart(selectedPart.id, { offset: newOffset })
                }}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono text-white/80 focus:border-green-400/50 focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Parent */}
      <div>
        <label className="text-xs text-white/50 block mb-1">Parent</label>

        <select
          value={selectedPart.parentId ?? ''}
          onChange={(e) =>
            updatePart(selectedPart.id, {
              parentId: e.target.value || null,
            })
          }
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono text-white/80 focus:border-green-400/50 focus:outline-none"
        >
          <option value="">None (root)</option>

          {parts
            .filter((p) => p.id !== selectedPart.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}
              </option>
            ))}
        </select>
      </div>

      {/* Z-Index */}
      <div>
        <label className="text-xs text-white/50 block mb-1">Z-Index (draw order)</label>

        <input
          type="number"
          value={selectedPart.zIndex}
          onChange={(e) =>
            updatePart(selectedPart.id, {
              zIndex: parseInt(e.target.value) || 0,
            })
          }
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono text-white/80 focus:border-green-400/50 focus:outline-none"
        />
      </div>
    </div>
  )
}

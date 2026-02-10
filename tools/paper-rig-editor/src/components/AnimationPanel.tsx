import { useEditorStore } from '../store'

export function AnimationPanel() {
  const animations = useEditorStore((s) => s.animations)
  const activeAnimationName = useEditorStore((s) => s.activeAnimationName)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const setActiveAnimation = useEditorStore((s) => s.setActiveAnimation)
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying)

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider">
        Animations
      </h2>

      {/* Animation list */}
      <div className="space-y-1">
        {animations.map((anim) => {
          const isActive = activeAnimationName === anim.name

          return (
            <button
              key={anim.name}
              className={`w-full text-left px-2 py-1.5 rounded text-xs font-mono transition-colors ${
                isActive
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'hover:bg-white/5 text-white/60'
              }`}
              onClick={() => {
                if (isActive) {
                  setActiveAnimation(null)
                  setIsPlaying(false)
                } else {
                  setActiveAnimation(anim.name)
                  setIsPlaying(true)
                }
              }}
            >
              <div className="flex items-center justify-between">
                <span>{anim.name}</span>

                <span className="text-[10px] text-white/30">
                  {anim.duration}s · {anim.fps}fps · {anim.interpolation}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Play/Stop */}
      {activeAnimationName && (
        <button
          className={`w-full px-3 py-2 rounded text-xs font-mono border transition-colors ${
            isPlaying
              ? 'border-red-400/50 text-red-300 hover:bg-red-400/10'
              : 'border-green-400/50 text-green-300 hover:bg-green-400/10'
          }`}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? '■ stop' : '▶ play'}
        </button>
      )}
    </div>
  )
}

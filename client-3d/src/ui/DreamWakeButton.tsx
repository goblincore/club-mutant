import { useUIStore } from '../stores/uiStore'

export function DreamWakeButton() {
  return (
    <button
      onClick={() => useUIStore.getState().setWakePromptOpen(true)}
      className="fixed bottom-4 right-4 group flex items-end gap-0.5 cursor-pointer"
      style={{ zIndex: 55 }}
      title="Wake up"
    >
      {/* Animated zzz */}
      <div className="flex flex-col items-start mb-1 pointer-events-none">
        <span
          className="text-[9px] font-mono text-white/30 animate-[dreamZ_2.5s_ease-in-out_infinite_0.6s]"
          style={{ marginLeft: 12 }}
        >
          z
        </span>
        <span
          className="text-[11px] font-mono text-white/40 animate-[dreamZ_2.5s_ease-in-out_infinite_0.3s]"
          style={{ marginLeft: 6 }}
        >
          z
        </span>
        <span className="text-[13px] font-mono text-white/50 animate-[dreamZ_2.5s_ease-in-out_infinite]">
          z
        </span>
      </div>

      {/* Bed icon */}
      <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 group-hover:bg-white/10 group-hover:border-white/20 transition-colors">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white/50 group-hover:text-white/80 transition-colors"
        >
          {/* Bed frame */}
          <path d="M2 18v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5" />
          {/* Mattress line */}
          <path d="M2 18h20" />
          {/* Legs */}
          <path d="M2 18v2" />
          <path d="M22 18v2" />
          {/* Headboard */}
          <path d="M2 13V8a2 2 0 0 1 2-2h3" />
          {/* Pillow */}
          <rect x="4" y="7" width="4" height="4" rx="1" />
        </svg>
      </div>
    </button>
  )
}

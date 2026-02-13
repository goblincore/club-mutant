import { useToastStore } from '../stores/toastStore'

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none"
      style={{ zIndex: 50 }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto px-4 py-1.5 rounded-lg text-[12px] font-mono backdrop-blur-sm border animate-fade-in-down ${
            toast.type === 'success'
              ? 'bg-green-900/80 border-green-500/30 text-green-300'
              : toast.type === 'error'
                ? 'bg-red-900/80 border-red-500/30 text-red-300'
                : 'bg-black/80 border-white/15 text-white/90'
          }`}
        >
          {toast.type === 'success' && '✓ '}
          {toast.type === 'error' && '✗ '}
          {toast.message}
        </div>
      ))}
    </div>
  )
}

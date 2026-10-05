import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePanelStore } from '../../stores/panelStore'

function DesktopLoading({ failed, onRetry }: { failed?: boolean; onRetry?: () => void }) {
  return <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[#071009] text-[#cfe7b5]" style={{ zIndex: 40 }}>
    <p role={failed ? 'alert' : 'status'} className="text-sm">{failed ? 'The desktop could not load. Please try again.' : 'Starting desktop…'}</p>
    <div className="flex gap-3">
      {failed && <button className="rounded border border-green-200/30 px-4 py-2 text-sm" onClick={onRetry}>Retry</button>}
      <button autoFocus className="rounded border border-green-200/30 px-4 py-2 text-sm" onClick={() => usePanelStore.getState().setOsActive(false)}>Return to club</button>
    </div>
  </div>
}

class DesktopLoadBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

/** The main entry imports only this gate, never OS components, stores or CSS. */
export function KonpyuuTALauncher() {
  const active = usePanelStore((state) => state.osActive)
  const [opened, setOpened] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const Shell = useMemo(() => lazy(() => import('./KonpyuuTAShell').then((module) => ({ default: module.KonpyuuTAShell }))), [attempt])
  useEffect(() => { if (active) setOpened(true) }, [active])

  // Keep the shell's service lifecycle after first use, matching its previous
  // behavior. It renders null when closed; a club-only visit never imports it.
  if (!active && !opened) return null
  return <DesktopLoadBoundary key={attempt} fallback={active ? <DesktopLoading failed onRetry={() => setAttempt((value) => value + 1)} /> : null}>
    <Suspense fallback={active ? <DesktopLoading /> : null}><Shell /></Suspense>
  </DesktopLoadBoundary>
}

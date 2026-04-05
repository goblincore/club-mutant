import { useWindowStore } from '../stores/windowStore'

export function useWindow(id: string) {
  const win = useWindowStore((s) => s.windows[id])
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const moveWindow = useWindowStore((s) => s.moveWindow)
  const resizeWindow = useWindowStore((s) => s.resizeWindow)
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow)
  const maximizeWindow = useWindowStore((s) => s.maximizeWindow)
  const shadeWindow = useWindowStore((s) => s.shadeWindow)

  return {
    win,
    close: () => closeWindow(id),
    focus: () => focusWindow(id),
    move: (pos: { x: number; y: number }) => moveWindow(id, pos),
    resize: (size: { width: number; height: number }) => resizeWindow(id, size),
    minimize: () => minimizeWindow(id),
    maximize: () => maximizeWindow(id),
    shade: () => shadeWindow(id),
  }
}

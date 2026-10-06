export interface PanelSize { width: number; height: number }
export function clampPanelSize(size: PanelSize, available: PanelSize, minimum: PanelSize): PanelSize {
  return {
    width: Math.min(available.width, Math.max(Math.min(minimum.width, available.width), size.width)),
    height: Math.min(available.height, Math.max(Math.min(minimum.height, available.height), size.height)),
  }
}

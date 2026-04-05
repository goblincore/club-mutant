// KonpyuuTA — React OS package
// Public API

// Root component (Task 6)
export { KonpyuuTADesktop } from './components/KonpyuuTADesktop'

// Context provider (Task 3)
export { KonpyuuTAProvider, useKonpyuuTA } from './context/KonpyuuTAContext'

// Stores (Task 2)
export { useWindowStore } from './stores/windowStore'
export { useDesktopStore } from './stores/desktopStore'
export { useSettingsStore } from './stores/settingsStore'

// Styles — import in your app root
// import '@club-mutant/konpyuuta/src/styles/cde.css'

export const KONPYUUTA_VERSION = '2.0.0'

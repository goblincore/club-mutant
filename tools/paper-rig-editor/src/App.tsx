import { Toolbar } from './components/Toolbar'
import { Viewport } from './components/Viewport'
import { PartsPanel } from './components/PartsPanel'
import { PropertiesPanel } from './components/PropertiesPanel'
import { AnimationPanel } from './components/AnimationPanel'

export function App() {
  return (
    <div className="flex flex-col h-screen w-screen bg-neutral-950 text-white font-mono">
      {/* Top toolbar */}
      <Toolbar />

      {/* Main layout: left sidebar | viewport | right sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — Parts list */}
        <div className="w-56 border-r border-white/10 bg-black/20 p-3 overflow-y-auto">
          <PartsPanel />
        </div>

        {/* Center — 3D viewport */}
        <div className="flex-1">
          <Viewport />
        </div>

        {/* Right sidebar — Properties + Animations */}
        <div className="w-64 border-l border-white/10 bg-black/20 p-3 overflow-y-auto space-y-6">
          <PropertiesPanel />

          <div className="border-t border-white/10 pt-4">
            <AnimationPanel />
          </div>
        </div>
      </div>
    </div>
  )
}

import { useCallback } from 'react'
import { useDreamDebugStore, type DreamDebugState, type BlendMode } from '../stores/dreamDebugStore'

type NumericKey = {
  [K in keyof DreamDebugState]: DreamDebugState[K] extends number ? K : never
}[keyof DreamDebugState]

type BooleanKey = {
  [K in keyof DreamDebugState]: DreamDebugState[K] extends boolean ? K : never
}[keyof DreamDebugState]

function Slider({
  label,
  field,
  min,
  max,
  step = 0.01,
}: {
  label: string
  field: NumericKey
  min: number
  max: number
  step?: number
}) {
  const value = useDreamDebugStore((s) => s[field]) as number
  const set = useDreamDebugStore((s) => s.set)

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      set({ [field]: parseFloat(e.target.value) })
    },
    [field, set]
  )

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between">
        <span className="text-white/40">{label}</span>
        <span className="text-white/30 tabular-nums">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        className="w-full h-1 accent-purple-500 cursor-pointer"
      />
    </div>
  )
}

function Toggle({ label, field }: { label: string; field: BooleanKey }) {
  const value = useDreamDebugStore((s) => s[field]) as boolean
  const set = useDreamDebugStore((s) => s.set)

  return (
    <label className="flex items-center gap-1.5 cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        onChange={() => set({ [field]: !value })}
        className="accent-green-500"
      />
      <span className="text-white/40">{label}</span>
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-white/60 text-[10px] uppercase tracking-wider border-b border-white/10 pb-0.5">
        {title}
      </div>
      {children}
    </div>
  )
}

const BLEND_MODES: BlendMode[] = ['none', 'difference', 'multiply', 'screen', 'overlay', 'add']

export function DreamDebugPanel() {
  const blendMode = useDreamDebugStore((s) => s.blendMode)
  const set = useDreamDebugStore((s) => s.set)
  const reset = useDreamDebugStore((s) => s.reset)

  return (
    <div
      className="fixed top-2 left-2 font-mono text-[11px] flex flex-col gap-2 rounded bg-black/90 border border-white/10 px-2.5 py-2 select-none overflow-y-auto"
      style={{ zIndex: 9999, maxHeight: 'calc(100vh - 16px)', width: 220 }}
    >
      <div className="flex justify-between items-center">
        <span className="text-purple-400 font-bold">dream debug</span>
        <button
          onClick={reset}
          className="text-[9px] text-yellow-400/70 hover:text-yellow-300 transition-colors"
        >
          reset all
        </button>
      </div>

      <Section title="Render">
        <Slider label="resolution" field="dreamRenderScale" min={0.15} max={1} />
      </Section>

      <Section title="VHS">
        <Toggle label="vhs effect" field="vhsEffect" />
        <Slider label="strength" field="vhsStrength" min={0} max={1} />
      </Section>

      <Section title="UV Effects">
        <Toggle label="chromatic aberration" field="chromaAberration" />
        <Slider label="chroma strength" field="chromaStrength" min={0} max={2} />
        <Toggle label="zoom pulse" field="zoomPulse" />
        <Toggle label="rotation" field="rotation" />
        <Toggle label="stretch" field="stretch" />
        <Toggle label="liquid warp" field="liquidWarp" />
        <Slider label="liquid amount" field="liquidAmount" min={0} max={0.2} />
        <Toggle label="fisheye" field="fisheye" />
        <Slider label="fisheye amount" field="fisheyeAmount" min={0} max={3} />
      </Section>

      <Section title="Blend Mode">
        <div className="flex flex-wrap gap-1">
          {BLEND_MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => set({ blendMode: mode })}
              className={`text-[9px] px-1.5 py-0.5 rounded border transition-all ${
                blendMode === mode
                  ? 'border-purple-500/60 text-purple-300 bg-purple-500/10'
                  : 'border-white/10 text-white/30'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <Slider label="blend opacity" field="blendOpacity" min={0} max={1} />
      </Section>

      <Section title="Color / Post">
        <Toggle label="hue rotation" field="hueRotation" />
        <Slider label="hue speed" field="hueSpeed" min={0} max={0.2} />
        <Slider label="saturation" field="saturation" min={0.5} max={2} />
        <Toggle label="film grain" field="filmGrain" />
        <Toggle label="vignette" field="vignette" />
        <Slider label="vignette size" field="vignetteSize" min={0.1} max={1} />
      </Section>

      <Section title="Scanlines">
        <Toggle label="scanlines" field="scanlines" />
        <Slider label="count (0=auto)" field="scanlineCount" min={0} max={500} step={1} />
        <Slider label="thickness" field="scanlineThickness" min={0} max={1} />
        <Slider label="intensity" field="scanlineIntensity" min={0} max={1} />
        <Slider label="scroll speed" field="scanlineScrollSpeed" min={0} max={5} />
      </Section>

      <Section title="Glitch">
        <Toggle label="interference lines" field="interferenceLines" />
        <Slider label="interference amt" field="interferenceIntensity" min={0} max={1} />
        <Toggle label="frame ghosting" field="frameGhosting" />
        <Slider label="ghost amt" field="frameGhostIntensity" min={0} max={1} />
        <Toggle label="signal dropout" field="signalDropout" />
        <Slider label="dropout amt" field="signalDropoutIntensity" min={0} max={1} />
      </Section>

      <Section title="Transitions">
        <Slider label="duration (ms)" field="transitionDuration" min={1000} max={15000} step={500} />
      </Section>

      <Section title="Playback">
        <Slider label="rate min" field="playbackRateMin" min={0.1} max={1} />
        <Slider label="rate max" field="playbackRateMax" min={0.1} max={1} />
        <Toggle label="random cuts" field="randomCuts" />
        <Slider label="cut chance" field="randomCutChance" min={0} max={1} />
        <Slider label="cut interval min (ms)" field="cutIntervalMin" min={3000} max={30000} step={1000} />
        <Slider label="cut interval max (ms)" field="cutIntervalMax" min={5000} max={60000} step={1000} />
      </Section>

      <div className="text-white/20 text-[9px] text-center pt-1 border-t border-white/5">
        press <span className="text-white/40">D</span> to toggle
      </div>
    </div>
  )
}

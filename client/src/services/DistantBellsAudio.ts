export class DistantBellsAudioManager {
  private audioContext: AudioContext | null = null
  private isPlaying = false
  private bellInterval: number | null = null
  private volume = 0.6

  constructor() {
    // AudioContext will be created on first user interaction
  }

  private createAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    return this.audioContext
  }

  private playBellSound(): void {
    if (!this.audioContext) return

    const now = this.audioContext.currentTime
    
    // Bell frequencies (church bell range)
    const frequencies = [
      110.00,  // A2 - deep toll
      130.81,  // C3
      146.83,  // D3
      164.81,  // E3
      196.00,  // G3
      220.00,  // A3
    ]
    const freq = frequencies[Math.floor(Math.random() * frequencies.length)]
    
    // Create bell with multiple partials for metallic bell sound
    // Church bells have specific harmonic ratios: 1, 2.0, 3.0, 4.2, 5.4, 6.8
    const partials = [
      { ratio: 1.0, gain: 1.0, decay: 4.0 },    // Fundamental (hum)
      { ratio: 2.0, gain: 0.8, decay: 3.0 },    // Prime
      { ratio: 3.0, gain: 0.6, decay: 2.5 },    // Tierce
      { ratio: 4.2, gain: 0.4, decay: 2.0 },    // Quint
      { ratio: 5.4, gain: 0.3, decay: 1.5 },    // Nominal
      { ratio: 6.8, gain: 0.2, decay: 1.0 },    // Superquint
    ]
    
    const masterGain = this.audioContext.createGain()
    masterGain.gain.value = this.volume * 0.3 // Scale down to prevent clipping
    masterGain.connect(this.audioContext.destination)
    
    partials.forEach((partial, index) => {
      const osc = this.audioContext!.createOscillator()
      const gain = this.audioContext!.createGain()
      
      // Use triangle wave for more metallic/harmonic content than sine
      osc.type = index === 0 ? 'sine' : 'triangle'
      osc.frequency.value = freq * partial.ratio
      
      // Sharp attack, long exponential decay
      const attackTime = 0.01 + (index * 0.005) // Higher partials slightly delayed
      const decayTime = partial.decay * (0.8 + Math.random() * 0.4)
      
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(partial.gain, now + attackTime)
      gain.gain.exponentialRampToValueAtTime(0.001, now + decayTime)
      
      osc.connect(gain)
      gain.connect(masterGain)
      
      osc.start(now)
      osc.stop(now + decayTime + 0.1)
      
      // Cleanup
      setTimeout(() => {
        osc.disconnect()
        gain.disconnect()
      }, (decayTime + 0.2) * 1000)
    })
    
    // Add a subtle "clapper" strike sound at the beginning
    const clapperOsc = this.audioContext.createOscillator()
    const clapperGain = this.audioContext.createGain()
    
    clapperOsc.type = 'square'
    clapperOsc.frequency.value = freq * 8 // Very high frequency
    clapperGain.gain.setValueAtTime(0, now)
    clapperGain.gain.linearRampToValueAtTime(0.1, now + 0.005)
    clapperGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
    
    // Lowpass filter the clapper to soften it
    const clapperFilter = this.audioContext.createBiquadFilter()
    clapperFilter.type = 'lowpass'
    clapperFilter.frequency.value = 3000
    
    clapperOsc.connect(clapperFilter)
    clapperFilter.connect(clapperGain)
    clapperGain.connect(masterGain)
    
    clapperOsc.start(now)
    clapperOsc.stop(now + 0.15)
    
    setTimeout(() => {
      clapperOsc.disconnect()
      clapperFilter.disconnect()
      clapperGain.disconnect()
      masterGain.disconnect()
    }, 5000)
    
    console.log(`[DistantBells] Tolling ${freq.toFixed(2)}Hz`)
  }

  private startBellTolling(): void {
    // Play initial bell immediately
    this.playBellSound()
    
    // Schedule next bells
    const scheduleNextBell = () => {
      if (!this.isPlaying) return
      
      const delay = 4000 + Math.random() * 4000 // 4-8 seconds between bells
      this.bellInterval = window.setTimeout(() => {
        if (this.isPlaying) {
          this.playBellSound()
          scheduleNextBell()
        }
      }, delay)
    }
    
    scheduleNextBell()
  }

  start(): void {
    if (this.isPlaying) return

    try {
      const audioContext = this.createAudioContext()

      // Resume context if suspended (browser autoplay policy)
      if (audioContext.state === 'suspended') {
        audioContext.resume()
      }

      this.isPlaying = true

      // Start the bell tolling
      this.startBellTolling()

      console.log('[DistantBells] Started bell tolling')
    } catch (error) {
      console.error('[DistantBells] Failed to start:', error)
    }
  }

  stop(): void {
    if (!this.isPlaying) return

    try {
      // Clear bell interval
      if (this.bellInterval) {
        clearTimeout(this.bellInterval)
        this.bellInterval = null
      }

      this.isPlaying = false
      console.log('[DistantBells] Stopped bell tolling')
    } catch (error) {
      console.error('[DistantBells] Failed to stop:', error)
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume))
  }

  getVolume(): number {
    return this.volume
  }

  isActive(): boolean {
    return this.isPlaying
  }

  destroy(): void {
    this.stop()
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close()
    }
    this.audioContext = null
  }
}

// Singleton instance for the game
export const distantBellsManager = new DistantBellsAudioManager()

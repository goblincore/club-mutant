export class BrownNoiseAudioManager {
  private audioContext: AudioContext | null = null
  private brownNoiseNode: AudioBufferSourceNode | null = null
  private gainNode: GainNode | null = null
  private reverbNode: ConvolverNode | null = null
  private reverbGainNode: GainNode | null = null
  private dryGainNode: GainNode | null = null
  private lowPassFilter: BiquadFilterNode | null = null
  private bellOscillator: OscillatorNode | null = null
  private bellGain: GainNode | null = null
  private bellInterval: number | null = null
  private isPlaying = false
  private volume = 0.5
  private reverbAmount = 0.85

  constructor() {
    // AudioContext will be created on first user interaction
  }

  private createAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    return this.audioContext
  }

  private generateBrownNoiseBuffer(audioContext: AudioContext): AudioBuffer {
    const sampleRate = audioContext.sampleRate
    const bufferSize = sampleRate * 2 // 2 seconds of noise
    const buffer = audioContext.createBuffer(1, bufferSize, sampleRate)
    const data = buffer.getChannelData(0)

    // Brown noise using leaky integrator
    let lastOut = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      // Leaky integrator with coefficient 0.99 (very leaky to prevent overflow)
      lastOut = (lastOut * 0.99) + (white * 0.01)
      data[i] = lastOut * 10 // Boost gain significantly
    }

    return buffer
  }

  private createReverbImpulse(audioContext: AudioContext): AudioBuffer {
    const sampleRate = audioContext.sampleRate
    const length = sampleRate * 6.0 // 6.0 seconds reverb tail (very long reverb)
    const decay = 1.2
    const impulse = audioContext.createBuffer(2, length, sampleRate)

    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel)
      for (let i = 0; i < length; i++) {
        // Exponential decay with some randomness for natural reverb
        const decayFactor = Math.pow(1 - i / length, decay)
        channelData[i] = (Math.random() * 2 - 1) * decayFactor
      }
    }

    return impulse
  }

  private playBellSound(): void {
    if (!this.audioContext || !this.reverbNode) return

    const now = this.audioContext.currentTime
    
    // Random bell frequency (low, tolling range)
    const frequencies = [110, 130.81, 146.83, 164.81, 196.00, 220.00] // A2, C3, D3, E3, G3, A3
    const freq = frequencies[Math.floor(Math.random() * frequencies.length)]
    
    // Create bell oscillator (sine wave for pure tone)
    const osc = this.audioContext.createOscillator()
    const bellGain = this.audioContext.createGain()
    
    osc.type = 'sine'
    osc.frequency.value = freq
    
    // Very long decay envelope (3-6 seconds)
    const decayTime = 3 + Math.random() * 3
    bellGain.gain.setValueAtTime(0, now)
    bellGain.gain.linearRampToValueAtTime(0.08, now + 0.05) // Soft attack
    bellGain.gain.exponentialRampToValueAtTime(0.001, now + decayTime)
    
    // Connect through reverb for distant sound
    osc.connect(bellGain)
    bellGain.connect(this.reverbNode)
    
    osc.start(now)
    osc.stop(now + decayTime + 0.1)
    
    // Clean up
    setTimeout(() => {
      osc.disconnect()
      bellGain.disconnect()
    }, (decayTime + 0.2) * 1000)
  }

  private startBellTolling(): void {
    // Play a bell sound every 8-20 seconds (random intervals)
    const scheduleNextBell = () => {
      if (!this.isPlaying) return
      
      const delay = 8000 + Math.random() * 12000 // 8-20 seconds
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

      // Create brown noise buffer and source
      const noiseBuffer = this.generateBrownNoiseBuffer(audioContext)
      this.brownNoiseNode = audioContext.createBufferSource()
      this.brownNoiseNode.buffer = noiseBuffer
      this.brownNoiseNode.loop = true

      // Create low-pass filter to emphasize lower frequencies
      this.lowPassFilter = audioContext.createBiquadFilter()
      this.lowPassFilter.type = 'lowpass'
      this.lowPassFilter.frequency.value = 400 // Cut off higher frequencies
      this.lowPassFilter.Q.value = 0.5

      // Create gain nodes for volume control
      this.gainNode = audioContext.createGain()
      this.gainNode.gain.value = this.volume

      // Create dry/wet mix for reverb
      this.dryGainNode = audioContext.createGain()
      this.dryGainNode.gain.value = 1 - this.reverbAmount

      this.reverbGainNode = audioContext.createGain()
      this.reverbGainNode.gain.value = this.reverbAmount

      // Create reverb convolver
      this.reverbNode = audioContext.createConvolver()
      this.reverbNode.buffer = this.createReverbImpulse(audioContext)

      // Connect the graph:
      // brownNoise -> lowPassFilter -> gain -> dryGain -> destination
      //                                    -> reverbNode -> reverbGain -> destination
      this.brownNoiseNode.connect(this.lowPassFilter)
      this.lowPassFilter.connect(this.gainNode)
      this.gainNode.connect(this.dryGainNode)
      this.gainNode.connect(this.reverbNode)

      this.dryGainNode.connect(audioContext.destination)
      this.reverbNode.connect(this.reverbGainNode)
      this.reverbGainNode.connect(audioContext.destination)

      this.brownNoiseNode.start()
      this.isPlaying = true

      // Start the bell tolling
      this.startBellTolling()

      console.log('[BrownNoise] Started background ambience with bells')
    } catch (error) {
      console.error('[BrownNoise] Failed to start:', error)
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

      this.brownNoiseNode?.stop()
      this.brownNoiseNode?.disconnect()
      this.lowPassFilter?.disconnect()
      this.reverbNode?.disconnect()
      this.gainNode?.disconnect()
      this.dryGainNode?.disconnect()
      this.reverbGainNode?.disconnect()

      this.brownNoiseNode = null
      this.lowPassFilter = null
      this.reverbNode = null
      this.gainNode = null
      this.dryGainNode = null
      this.reverbGainNode = null

      this.isPlaying = false
      console.log('[BrownNoise] Stopped background ambience')
    } catch (error) {
      console.error('[BrownNoise] Failed to stop:', error)
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume))
    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(this.volume, this.audioContext!.currentTime, 0.1)
    }
  }

  getVolume(): number {
    return this.volume
  }

  setReverbAmount(amount: number): void {
    this.reverbAmount = Math.max(0, Math.min(1, amount))
    if (this.dryGainNode && this.reverbGainNode) {
      const now = this.audioContext!.currentTime
      this.dryGainNode.gain.setTargetAtTime(1 - this.reverbAmount, now, 0.1)
      this.reverbGainNode.gain.setTargetAtTime(this.reverbAmount, now, 0.1)
    }
  }

  getReverbAmount(): number {
    return this.reverbAmount
  }

  isActive(): boolean {
    return this.isPlaying
  }

  mute(): void {
    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(0, this.audioContext!.currentTime, 0.05)
    }
  }

  unmute(): void {
    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(this.volume, this.audioContext!.currentTime, 0.05)
    }
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
export const brownNoiseManager = new BrownNoiseAudioManager()

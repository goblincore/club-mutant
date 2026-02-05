export class WhiteNoiseAudioManager {
  private audioContext: AudioContext | null = null
  private whiteNoiseNode: AudioBufferSourceNode | null = null
  private gainNode: GainNode | null = null
  private reverbNode: ConvolverNode | null = null
  private reverbGainNode: GainNode | null = null
  private dryGainNode: GainNode | null = null
  private isPlaying = false
  private volume = 0.15
  private reverbAmount = 0.4

  constructor() {
    // AudioContext will be created on first user interaction
  }

  private createAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    return this.audioContext
  }

  private generateWhiteNoiseBuffer(audioContext: AudioContext): AudioBuffer {
    const sampleRate = audioContext.sampleRate
    const bufferSize = sampleRate * 2 // 2 seconds of noise
    const buffer = audioContext.createBuffer(1, bufferSize, sampleRate)
    const data = buffer.getChannelData(0)

    for (let i = 0; i < bufferSize; i++) {
      // White noise: completely random values between -1 and 1
      data[i] = Math.random() * 2 - 1
    }

    return buffer
  }

  private createReverbImpulse(audioContext: AudioContext): AudioBuffer {
    const sampleRate = audioContext.sampleRate
    const length = sampleRate * 2.5 // 2.5 seconds reverb tail
    const decay = 2.0
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

  start(): void {
    if (this.isPlaying) return

    try {
      const audioContext = this.createAudioContext()

      // Resume context if suspended (browser autoplay policy)
      if (audioContext.state === 'suspended') {
        audioContext.resume()
      }

      // Create white noise buffer and source
      const noiseBuffer = this.generateWhiteNoiseBuffer(audioContext)
      this.whiteNoiseNode = audioContext.createBufferSource()
      this.whiteNoiseNode.buffer = noiseBuffer
      this.whiteNoiseNode.loop = true

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
      // whiteNoise -> gain -> dryGain -> destination
      //                    -> reverbNode -> reverbGain -> destination
      this.whiteNoiseNode.connect(this.gainNode)
      this.gainNode.connect(this.dryGainNode)
      this.gainNode.connect(this.reverbNode)

      this.dryGainNode.connect(audioContext.destination)
      this.reverbNode.connect(this.reverbGainNode)
      this.reverbGainNode.connect(audioContext.destination)

      this.whiteNoiseNode.start()
      this.isPlaying = true

      console.log('[WhiteNoise] Started background ambience')
    } catch (error) {
      console.error('[WhiteNoise] Failed to start:', error)
    }
  }

  stop(): void {
    if (!this.isPlaying) return

    try {
      this.whiteNoiseNode?.stop()
      this.whiteNoiseNode?.disconnect()
      this.reverbNode?.disconnect()
      this.gainNode?.disconnect()
      this.dryGainNode?.disconnect()
      this.reverbGainNode?.disconnect()

      this.whiteNoiseNode = null
      this.reverbNode = null
      this.gainNode = null
      this.dryGainNode = null
      this.reverbGainNode = null

      this.isPlaying = false
      console.log('[WhiteNoise] Stopped background ambience')
    } catch (error) {
      console.error('[WhiteNoise] Failed to stop:', error)
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
export const whiteNoiseManager = new WhiteNoiseAudioManager()

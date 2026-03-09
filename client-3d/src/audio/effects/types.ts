export interface PitchEffect {
  readonly name: string
  /** Wire into the audio graph: input → effect → output */
  connect(ctx: AudioContext, input: AudioNode, output: AudioNode): void
  /** Disconnect all nodes */
  disconnect(): void
  /** Re-roll random parameters */
  randomize(): void
}

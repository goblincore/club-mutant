/**
 * Seek helpers for react-player.
 *
 * react-player queues a seek made before the player is ready (`seekOnPlay`) and
 * replays it on first play as `this.seekTo(amount)` WITHOUT the 'seconds' unit, so
 * any amount strictly between 0 and 1 is read as a fraction of the track duration.
 * A 0.02s offset on a 5 minute track then becomes "jump to 6s", which is audible
 * as a few seconds of the wrong part of the song before the drift check corrects it.
 *
 * Never hand react-player an amount in (0, 1): sub-second offsets are not worth a
 * seek, so round them down to 0 (which react-player does not queue).
 */
export function seekTargetSeconds(offsetSec: number): number {
  return Number.isFinite(offsetSec) && offsetSec >= 1 ? offsetSec : 0
}

interface SeekablePlayer {
  seekTo(amount: number, type?: 'seconds' | 'fraction'): void
}

/** Seek to a position in seconds, skipping the no-op case and never passing a fractional-looking amount. */
export function seekPlayerToOffset(player: SeekablePlayer, offsetSec: number): void {
  const target = seekTargetSeconds(offsetSec)
  if (target > 0) player.seekTo(target, 'seconds')
}

/**
 * Resync an already-running player to `expectedSec`. A target under a second means
 * "restart from the beginning", expressed as an exact 0 rather than a (0, 1) amount.
 */
export function resyncPlayerTo(player: SeekablePlayer, expectedSec: number): void {
  player.seekTo(seekTargetSeconds(expectedSec), 'seconds')
}

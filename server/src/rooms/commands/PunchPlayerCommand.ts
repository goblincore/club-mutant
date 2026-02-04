import { Command } from '@colyseus/command'
import { Client } from 'colyseus'

import type { ClubMutant } from '../ClubMutant'
import { Message } from '../../types/Messages'
import { TEXTURE_IDS, encodeAnimKey } from '../../types/AnimationCodec'

type Payload = {
  client: Client
  targetId: string
}

export default class PunchPlayerCommand extends Command<ClubMutant, Payload> {
  execute(data: Payload) {
    const attacker = this.state.players.get(data.client.sessionId)
    if (!attacker) return

    const targetId = typeof data.targetId === 'string' ? data.targetId : ''
    if (!targetId) return

    if (targetId === data.client.sessionId) return

    const victim = this.state.players.get(targetId)
    if (!victim) return

    const dx = attacker.x - victim.x
    const dy = attacker.y - victim.y
    // Generous server range to match client - allows hitting with small collision boxes
    const punchRange = 65
    const distSq = dx * dx + dy * dy
    if (distSq > punchRange * punchRange) return

    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    const diagonalThreshold = 0.5
    const isDiagonal =
      absDx > 0 &&
      absDy > 0 &&
      absDx / absDy > diagonalThreshold &&
      absDy / absDx > diagonalThreshold

    let dir: 'left' | 'right' | 'down' | 'down_left' | 'down_right' | 'up_left' | 'up_right'

    if (isDiagonal) {
      if (dy > 0) {
        dir = dx >= 0 ? 'down_right' : 'down_left'
      } else {
        dir = dx >= 0 ? 'up_right' : 'up_left'
      }
    } else if (absDx >= absDy) {
      dir = dx >= 0 ? 'right' : 'left'
    } else {
      dir = dy >= 0 ? 'down' : 'up_right'
    }

    if (victim.textureId !== TEXTURE_IDS.mutant) return

    // Randomly pick hit1 or hit2
    const hitType = Math.random() > 0.5 ? 'hit1' : 'hit2'
    const hitAnimKey = `mutant_${hitType}_${dir}`

    const punchImpactDelayMs = 370
    const punchKnockbackDelayMs = 150
    const punchKnockbackPx = 6

    const attackerAtPunch = { x: attacker.x, y: attacker.y }

    // First: trigger hit animation
    this.clock.setTimeout(() => {
      const victimCurrent = this.state.players.get(targetId)
      if (!victimCurrent) return

      const hitEncoded = encodeAnimKey(hitAnimKey)
      victimCurrent.textureId = hitEncoded.textureId
      victimCurrent.animId = hitEncoded.animId

      const victimClient = this.room.clients.find((c) => c.sessionId === targetId)

      // Broadcast to everyone ELSE (OtherPlayer instances)
      this.room.broadcast(
        Message.UPDATE_PLAYER_ACTION,
        {
          x: victimCurrent.x,
          y: victimCurrent.y,
          textureId: victimCurrent.textureId,
          animId: victimCurrent.animId,
          sessionId: targetId,
        },
        { except: victimClient }
      )

      // Send to the victim specifically
      if (victimClient) {
        victimClient.send(Message.PUNCH_PLAYER, {
          anim: hitAnimKey,
          x: victimCurrent.x,
          y: victimCurrent.y,
        })
      }

      // Second: apply knockback after a short delay
      this.clock.setTimeout(() => {
        const victimForKnockback = this.state.players.get(targetId)
        if (!victimForKnockback) return

        const kbDx = victimForKnockback.x - attackerAtPunch.x
        const kbDy = victimForKnockback.y - attackerAtPunch.y
        const kbLen = Math.sqrt(kbDx * kbDx + kbDy * kbDy)

        const kbUnitX = kbLen > 0 ? kbDx / kbLen : 0
        const kbUnitY = kbLen > 0 ? kbDy / kbLen : 0

        victimForKnockback.x += kbUnitX * punchKnockbackPx
        victimForKnockback.y += kbUnitY * punchKnockbackPx
      }, punchKnockbackDelayMs)
    }, punchImpactDelayMs)
  }
}

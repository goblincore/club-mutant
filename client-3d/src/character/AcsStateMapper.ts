/**
 * AcsStateMapper — Maps server NPC behavior states to ACS animation states.
 *
 * The server uses states like 'idle', 'walking', 'dancing', 'conversing'
 * (from ClubMutant.ts updateNpc). ACS characters use state-grouped animations:
 *   IDLING, SPEAKING, GREETING, LOOKING, REACTING, etc.
 *
 * This mapper also considers the PaperDoll animation names (idle, walk, dance)
 * that come through the animId codec, mapping them to ACS equivalents.
 */

import type { AcsNpcState } from './AcsAnimationEngine'

/**
 * Map a PaperDoll-style animation name to an ACS animation state.
 * Used when the server communicates via animId (packDirectionalAnimId).
 */
export function paperDollAnimToAcsState(animName: string): AcsNpcState {
  switch (animName.toLowerCase()) {
    case 'walk':
      return 'idle'       // ACS chars don't have walk anims — use idle + walk shader
    case 'dance':
      return 'idle'       // ACS chars don't have dance anims — stay idle (or could add later)
    case 'wave':
      return 'greeting'
    case 'idle':
    default:
      return 'idle'
  }
}

/**
 * Map a server NPC behavior state to an ACS animation state.
 * Used when we add npcAnimState to the schema (Phase 2).
 */
export function npcBehaviorToAcsState(npcState: string): AcsNpcState {
  switch (npcState.toLowerCase()) {
    case 'conversing':
    case 'speaking':
      return 'speaking'
    case 'greeting':
      return 'greeting'
    case 'reacting':
      return 'reacting'
    case 'dancing':
      return 'idle'     // No dance anims in ACS — just idle
    case 'walking':
      return 'idle'     // Walk shader handles movement visuals
    case 'idle':
    default:
      return 'idle'
  }
}

/**
 * Determine if a character path points to an ACS file.
 * ACS characters use .acs extension; PaperDoll characters are directories.
 */
export function isAcsCharacter(characterPath: string): boolean {
  return characterPath.toLowerCase().endsWith('.acs')
}

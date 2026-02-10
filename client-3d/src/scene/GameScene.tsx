import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'

import { Room } from './Room'
import { FollowCamera } from './Camera'
import { PlayerEntity } from './PlayerEntity'
import { useGameStore } from '../stores/gameStore'
import { usePlayerInput } from '../input/usePlayerInput'

const DEFAULT_CHARACTER = '/characters/default'

function Players() {
  const players = useGameStore((s) => s.players)
  const mySessionId = useGameStore((s) => s.mySessionId)

  return (
    <>
      {Array.from(players.entries()).map(([sessionId, player]) => (
        <PlayerEntity
          key={sessionId}
          player={player}
          isLocal={sessionId === mySessionId}
          characterPath={DEFAULT_CHARACTER}
        />
      ))}
    </>
  )
}

export function GameScene() {
  usePlayerInput()

  return (
    <Canvas
      camera={{ position: [0, 8, 8], fov: 50, near: 0.1, far: 100 }}
      gl={{ antialias: false, alpha: false }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#0a0a1a']} />

      <Suspense fallback={null}>
        <Room />
        <Players />
        <FollowCamera />
      </Suspense>
    </Canvas>
  )
}

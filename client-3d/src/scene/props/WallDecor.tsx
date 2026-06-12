import * as THREE from 'three'
import { AudioReactiveVideoMaterial } from '../../shaders/AudioReactiveVideoMaterial'

// ── Video display — mounted above the counter like a diner TV ──
export function VideoDisplay({
  position,
  rotation,
  videoTexture,
  slideshowTexture,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  videoTexture?: THREE.VideoTexture | null
  slideshowTexture?: THREE.Texture | null
}) {
  const SCREEN_W = 2.2
  const SCREEN_H = SCREEN_W * (9 / 16)
  const displayTexture = videoTexture ?? slideshowTexture

  return (
    <group position={position} rotation={rotation}>
      {/* Bezel */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[SCREEN_W + 0.08, SCREEN_H + 0.08, 0.08]} />
        <meshStandardMaterial color="#111" roughness={0.7} />
      </mesh>
      {/* Screen — audio-reactive shader when video, basic when slideshow/off */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        {displayTexture ? (
          <AudioReactiveVideoMaterial videoTexture={displayTexture} />
        ) : (
          <meshStandardMaterial color="#060810" emissive="#030408" emissiveIntensity={0.5} />
        )}
      </mesh>
    </group>
  )
}

// ── Vinyl record decoration on the wall ──
export function WallRecord({
  position,
  rotation,
  color = '#222222',
  labelColor = '#cc3322',
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  color?: string
  labelColor?: string
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <cylinderGeometry args={[0.15, 0.15, 0.012, 16]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.007, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.004, 12]} />
        <meshStandardMaterial color={labelColor} roughness={0.7} />
      </mesh>
    </group>
  )
}

// ── Retro diner poster — coloured rectangle with inner frame + label stripe ──
export function DinerPoster({
  position,
  rotation,
  width = 0.38,
  height = 0.52,
  bgColor = '#1a0a0a',
  accentColor = '#cc2233',
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  width?: number
  height?: number
  bgColor?: string
  accentColor?: string
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Outer frame */}
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[width + 0.04, height + 0.04, 0.018]} />
        <meshStandardMaterial color="#2a1a00" roughness={0.8} metalness={0.1} />
      </mesh>
      {/* Poster background */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={bgColor} roughness={0.9} />
      </mesh>
      {/* Inner accent border */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[width - 0.04, height - 0.04]} />
        <meshStandardMaterial color={accentColor} roughness={0.85} />
      </mesh>
      {/* Inner dark panel */}
      <mesh position={[0, 0.03, 0.002]}>
        <planeGeometry args={[width - 0.08, height - 0.12]} />
        <meshStandardMaterial color="#0d0404" roughness={0.95} />
      </mesh>
      {/* Bottom label stripe */}
      <mesh position={[0, -(height / 2 - 0.045), 0.002]}>
        <planeGeometry args={[width - 0.04, 0.07]} />
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={0.3}
          roughness={0.7}
        />
      </mesh>
    </group>
  )
}

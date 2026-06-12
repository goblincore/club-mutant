import { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { AudioReactiveVideoMaterial } from '../../../shaders/AudioReactiveVideoMaterial'

// Video display — screen on the back wall behind the DJ booth
export function VideoDisplay({
  position,
  videoTexture,
  slideshowTexture,
}: {
  position: [number, number, number]
  videoTexture?: THREE.VideoTexture | null
  slideshowTexture?: THREE.Texture | null
}) {
  const SCREEN_W = 4.0
  const SCREEN_H = SCREEN_W * (9 / 16)
  const BEZEL = 0.1
  const FRAME_DEPTH = 0.08

  const displayTexture = videoTexture ?? slideshowTexture

  return (
    <group position={position}>
      {/* Frame / bezel */}
      <mesh position={[0, 0, -FRAME_DEPTH / 2]}>
        <boxGeometry args={[SCREEN_W + BEZEL * 2, SCREEN_H + BEZEL * 2, FRAME_DEPTH]} />
        <meshStandardMaterial color="#0a0a0a" />
      </mesh>

      {/* Screen surface — audio-reactive shader when video, basic when slideshow/off */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        {displayTexture ? (
          <AudioReactiveVideoMaterial videoTexture={displayTexture} />
        ) : (
          <meshStandardMaterial color="#080812" emissive="#060610" emissiveIntensity={0.3} />
        )}
      </mesh>
    </group>
  )
}

// Door — recessed rectangle with a frame and handle knob
export function Door({ position }: { position: [number, number, number] }) {
  const doorWidth = 1.6
  const doorHeight = 2.4

  return (
    <group position={position}>
      {/* Door frame (slightly larger, dark wood color) */}
      <mesh position={[0, doorHeight / 2, 0]}>
        <planeGeometry args={[doorWidth + 0.15, doorHeight + 0.08]} />
        <meshStandardMaterial color="#1a0e08" />
      </mesh>

      {/* Door panel */}
      <mesh position={[0, doorHeight / 2, 0.01]}>
        <planeGeometry args={[doorWidth, doorHeight]} />
        <meshStandardMaterial color="#3d1f0e" />
      </mesh>

      {/* Upper door panel inset */}
      <mesh position={[0, doorHeight * 0.68, 0.02]}>
        <planeGeometry args={[doorWidth * 0.7, doorHeight * 0.28]} />
        <meshStandardMaterial color="#4a2814" />
      </mesh>

      {/* Lower door panel inset */}
      <mesh position={[0, doorHeight * 0.3, 0.02]}>
        <planeGeometry args={[doorWidth * 0.7, doorHeight * 0.32]} />
        <meshStandardMaterial color="#4a2814" />
      </mesh>

      {/* Door handle */}
      <mesh position={[doorWidth * 0.35, doorHeight * 0.45, 0.04]}>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshStandardMaterial color="#c4a44a" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  )
}

// Picture frame — wooden border with image texture (or gray placeholder)
export function PictureFrame({
  position,
  rotation,
  size,
  imagePath,
}: {
  position: [number, number, number]
  rotation: [number, number, number]
  size: [number, number]
  imagePath: string
}) {
  const frameDepth = 0.06
  const borderWidth = 0.08
  const [w, h] = size

  // Try loading the image texture; fall back to null on error
  const texture = useRef<THREE.Texture | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loader = new THREE.TextureLoader()

    loader.load(
      imagePath,
      (tex) => {
        tex.minFilter = THREE.NearestFilter
        tex.magFilter = THREE.NearestFilter
        texture.current = tex
        setLoaded(true)
      },
      undefined,
      () => {
        // Image not found — use placeholder
        setLoaded(true)
      }
    )
  }, [imagePath])

  return (
    <group position={position} rotation={rotation}>
      {/* Frame border */}
      <mesh position={[0, 0, -frameDepth / 2]}>
        <boxGeometry args={[w + borderWidth * 2, h + borderWidth * 2, frameDepth]} />
        <meshStandardMaterial color="#2a1506" />
      </mesh>

      {/* Inner image or placeholder */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[w, h]} />
        {texture.current ? (
          <meshBasicMaterial map={texture.current} toneMapped={false} />
        ) : (
          <meshStandardMaterial color={loaded ? '#333' : '#222'} />
        )}
      </mesh>
    </group>
  )
}

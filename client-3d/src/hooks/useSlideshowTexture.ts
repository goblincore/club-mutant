import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

// Manifest: public/textures/slideshow/slideshow.json
// Format: { "images": ["1.png", "2.png", "3.png"] }
// Filenames are relative to /textures/slideshow/
const MANIFEST_URL = '/textures/slideshow/slideshow.json'
const SLIDESHOW_BASE = '/textures/slideshow/'

const SLIDE_DURATION = 5000 // ms between slides

const loader = new THREE.TextureLoader()

function loadTexture(path: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      path,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        resolve(tex)
      },
      undefined,
      reject
    )
  })
}

interface SlideshowManifest {
  images: string[]
}

async function fetchImagePaths(): Promise<string[]> {
  const res = await fetch(MANIFEST_URL)

  if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`)

  const data = (await res.json()) as SlideshowManifest

  return data.images.map((name) => `${SLIDESHOW_BASE}${name}`)
}

/**
 * Fetches slideshow.json, loads the listed images as THREE textures,
 * and cycles through them on a timer.
 * Returns the current texture (or null if disabled / no images loaded).
 * Intended as a fallback when the video background isn't available.
 */
export function useSlideshowTexture(enabled: boolean): THREE.Texture | null {
  const [current, setCurrent] = useState<THREE.Texture | null>(null)

  const texturesRef = useRef<THREE.Texture[]>([])
  const indexRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch manifest + load all images
  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    void (async () => {
      let paths: string[]

      try {
        paths = await fetchImagePaths()
      } catch (err) {
        console.warn('[Slideshow] Could not load manifest:', err)
        return
      }

      if (cancelled || paths.length === 0) return

      const loaded: THREE.Texture[] = []

      for (const path of paths) {
        try {
          const tex = await loadTexture(path)
          if (cancelled) {
            tex.dispose()
            return
          }
          loaded.push(tex)
        } catch {
          console.warn(`[Slideshow] Failed to load ${path}, skipping`)
        }
      }

      if (cancelled || loaded.length === 0) return

      texturesRef.current = loaded
      indexRef.current = 0
      setCurrent(loaded[0]!)
    })()

    return () => {
      cancelled = true
      texturesRef.current.forEach((t) => t.dispose())
      texturesRef.current = []
      setCurrent(null)
    }
  }, [enabled])

  // Cycle through images on a timer
  useEffect(() => {
    if (!enabled || texturesRef.current.length <= 1) return

    intervalRef.current = setInterval(() => {
      const textures = texturesRef.current
      if (textures.length === 0) return

      indexRef.current = (indexRef.current + 1) % textures.length
      setCurrent(textures[indexRef.current]!)
    }, SLIDE_DURATION)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [enabled, current])

  return current
}

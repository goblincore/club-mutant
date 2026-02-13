import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'

/**
 * Load and render a GLB model from the public/models/ directory.
 *
 * Usage:
 *   <GLBModel src="/models/old-computer-desk.glb" position={[0, 0, 0]} />
 *
 * The model is cloned so multiple instances don't share state.
 * drei's useGLTF caches the file after first load — no duplicate fetches.
 *
 * Preload models to avoid pop-in:
 *   GLBModel.preload('/models/old-computer-desk.glb')
 */
export function GLBModel({ src, ...groupProps }: { src: string } & JSX.IntrinsicElements['group']) {
  const { scene } = useGLTF(src)

  const cloned = useMemo(() => scene.clone(true), [scene])

  return <primitive object={cloned} {...groupProps} />
}

/** Eagerly fetch a GLB so it's cached before the component mounts. */
GLBModel.preload = (src: string) => useGLTF.preload(src)

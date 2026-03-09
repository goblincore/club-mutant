import { useDreamStore } from '../dream/dreamStore'
import { DreamScene } from './DreamScene'

export function DreamIframe() {
  const isDreaming = useDreamStore((s) => s.isDreaming)
  if (!isDreaming) return null
  return <DreamScene />
}

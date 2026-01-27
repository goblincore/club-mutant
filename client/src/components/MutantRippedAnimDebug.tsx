import { useEffect, useState } from 'react'
import styled from 'styled-components'
import Button from '@mui/material/Button'

import { phaserEvents, Event } from '../events/EventCenter'

const Wrapper = styled.div`
  position: fixed;
  left: 50%;
  top: 12px;
  transform: translateX(-50%);
  z-index: 25;
  pointer-events: auto;
  display: flex;
  gap: 10px;
  align-items: center;

  padding: 8px 10px;
  border-radius: 10px;

  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(8px);

  color: rgba(255, 255, 255, 0.9);

  button {
    text-transform: none;
  }
`

const Label = styled.div`
  font-family: Arial;
  font-size: 12px;
  max-width: 55vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export default function MutantRippedAnimDebug() {
  const [currentKey, setCurrentKey] = useState<string>('')

  useEffect(() => {
    const onCurrent = (key: unknown) => {
      if (typeof key !== 'string') return
      setCurrentKey(key)
    }

    phaserEvents.on(Event.MUTANT_RIPPED_DEBUG_CURRENT_ANIM, onCurrent)

    return () => {
      phaserEvents.off(Event.MUTANT_RIPPED_DEBUG_CURRENT_ANIM, onCurrent)
    }
  }, [])

  return (
    <Wrapper>
      <Button
        size="small"
        variant="contained"
        onClick={() => phaserEvents.emit(Event.MUTANT_RIPPED_DEBUG_NEXT_ANIM)}
      >
        Ripped Anims
      </Button>
      <Label>{currentKey || '—'}</Label>
    </Wrapper>
  )
}

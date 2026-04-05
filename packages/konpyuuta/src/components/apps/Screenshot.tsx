import { useState } from 'react'

type CaptureState = 'idle' | 'capturing' | 'preview' | 'saved'

export function Screenshot() {
  const [state, setState] = useState<CaptureState>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCapture() {
    setError(null)
    setState('capturing')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' } as MediaTrackConstraints,
        audio: false,
      })
      const video = document.createElement('video')
      video.srcObject = stream
      await new Promise<void>((resolve) => { video.onloadedmetadata = () => resolve() })
      await video.play()
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0)
      stream.getTracks().forEach((t) => t.stop())
      setPreviewUrl(canvas.toDataURL('image/png'))
      setState('preview')
    } catch {
      setState('idle')
      setError('Capture cancelled or not supported.')
    }
  }

  function handleSave() {
    if (!previewUrl) return
    const a = document.createElement('a')
    a.href = previewUrl
    a.download = `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
    a.click()
    setState('saved')
  }

  function handleNew() {
    setPreviewUrl(null)
    setState('idle')
    setError(null)
  }

  return (
    <div className="screenshot-app">
      <div className="screenshot-preview-area">
        {state === 'idle' && (
          <div className="screenshot-placeholder">
            <img src="/icons/apps/org.xfce.screenshooter.png" alt="" className="screenshot-icon" />
            <p>Click "Capture" to take a screenshot.</p>
            <p className="screenshot-hint">You will be asked to select what to capture.</p>
          </div>
        )}
        {state === 'capturing' && (
          <div className="screenshot-placeholder">
            <p>Select a window or screen to capture…</p>
          </div>
        )}
        {(state === 'preview' || state === 'saved') && previewUrl && (
          <img
            src={previewUrl}
            alt="Screenshot preview"
            className="screenshot-preview-img"
          />
        )}
      </div>

      {error && <div className="screenshot-error">{error}</div>}

      {state === 'saved' && (
        <div className="screenshot-saved-msg">Screenshot downloaded!</div>
      )}

      <div className="screenshot-toolbar">
        {(state === 'idle' || state === 'capturing') && (
          <button className="screenshot-btn" onClick={handleCapture} disabled={state === 'capturing'}>
            Capture…
          </button>
        )}
        {(state === 'preview' || state === 'saved') && (
          <>
            <button className="screenshot-btn" onClick={handleSave} disabled={state === 'saved'}>
              Save PNG
            </button>
            <button className="screenshot-btn" onClick={handleNew}>
              New
            </button>
          </>
        )}
      </div>
    </div>
  )
}

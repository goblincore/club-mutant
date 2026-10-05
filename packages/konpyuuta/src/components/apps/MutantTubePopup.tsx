import { useState, useEffect, useCallback, useRef } from 'react'

export type PopupType = 'alert' | 'confirm' | 'prompt' | 'select'

export interface PopupOption {
  label: string
  value: string
}

export interface PopupProps {
  isOpen: boolean
  type: PopupType
  title?: string
  message?: string
  placeholder?: string
  defaultValue?: string
  options?: PopupOption[]
  onConfirm: (value?: string) => void
  onCancel: () => void
}

export function MutantTubePopup({
  isOpen,
  type,
  title,
  message,
  placeholder,
  defaultValue,
  options,
  onConfirm,
  onCancel,
}: PopupProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const previousFocus = document.activeElement as HTMLElement | null
    const target = inputRef.current ?? selectRef.current ?? dialogRef.current?.querySelector<HTMLButtonElement>('button')
    target?.focus()
    inputRef.current?.select()
    return () => previousFocus?.focus()
  }, [isOpen, type, title, defaultValue])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Tab') {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input, select, button') ?? [])
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      } else if (e.key === 'Enter' && (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault()
        if (type === 'prompt') {
          onConfirm(inputRef.current?.value ?? '')
        } else if (type === 'select') {
          onConfirm(selectRef.current?.value ?? '')
        } else {
          onConfirm()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    },
    [type, onConfirm, onCancel]
  )

  const handleConfirm = useCallback(() => {
    if (type === 'prompt') {
      onConfirm(inputRef.current?.value ?? '')
    } else if (type === 'select') {
      onConfirm(selectRef.current?.value ?? '')
    } else {
      onConfirm()
    }
  }, [type, onConfirm])

  if (!isOpen) return null

  return (
    <div className="mt-popup-overlay" onClick={onCancel}>
      <div ref={dialogRef} className="mt-popup" role="dialog" aria-modal="true" aria-label={title || "TinyTubes"} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>

        {title && (
          <div className="mt-popup-header">
            <span className="mt-popup-title">{title}</span>
          </div>
        )}

        <div className="mt-popup-content">
          {message && <div className="mt-popup-message">{message}</div>}

          {type === 'prompt' && (
            <input
              ref={inputRef}
              type="text"
              className="mt-popup-input"
              placeholder={placeholder}
              defaultValue={defaultValue}
              aria-label={title || "Playlist name"}
              maxLength={type === 'prompt' && title?.toLowerCase().includes('import') ? 2048 : 60}
            />
          )}

          {type === 'select' && options && (
            <select ref={selectRef} className="mt-popup-select" defaultValue={defaultValue} aria-label="Playlist">
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          <div className="mt-popup-actions">
            {type === 'alert' ? (
              <button className="mt-popup-btn mt-popup-btn-primary" onClick={handleConfirm}>
                OK
              </button>
            ) : (
              <>
                <button className="mt-popup-btn mt-popup-btn-secondary" onClick={onCancel}>
                  Cancel
                </button>
                <button className="mt-popup-btn mt-popup-btn-primary" onClick={handleConfirm}>
                  Confirm
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

export function usePopup() {
  const [state, setState] = useState<{
    isOpen: boolean
    type: PopupType
    title?: string
    message?: string
    placeholder?: string
    defaultValue?: string
    options?: PopupOption[]
    resolve: ((value: string | boolean) => void) | null
  }>({
    isOpen: false,
    type: 'alert',
    resolve: null,
  })

  const alert = useCallback((message: string, title?: string): Promise<void> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        type: 'alert',
        title,
        message,
        resolve: () => resolve(),
      })
    })
  }, [])

  const confirm = useCallback((message: string, title?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        resolve: (value) => resolve(!!value),
      })
    })
  }, [])

  const prompt = useCallback(
    (message: string, defaultValue?: string, placeholder?: string, title?: string): Promise<string | null> => {
      return new Promise((resolve) => {
        setState({
          isOpen: true,
          type: 'prompt',
          title,
          message,
          placeholder,
          defaultValue,
          resolve: (value) => resolve(typeof value === 'string' ? value : null),
        })
      })
    },
    []
  )

  const select = useCallback(
    (message: string, options: PopupOption[], defaultValue?: string, title?: string): Promise<string | null> => {
      return new Promise((resolve) => {
        setState({
          isOpen: true,
          type: 'select',
          title,
          message,
          options,
          defaultValue,
          resolve: (value) => resolve(typeof value === 'string' ? value : null),
        })
      })
    },
    []
  )

  const handleConfirm = useCallback((value?: string) => {
    state.resolve?.(value ?? true)
    setState((s) => ({ ...s, isOpen: false, resolve: null }))
  }, [state.resolve])

  const handleCancel = useCallback(() => {
    state.resolve?.(false)
    setState((s) => ({ ...s, isOpen: false, resolve: null }))
  }, [state.resolve])

  const PopupComponent = (
    <MutantTubePopup
      isOpen={state.isOpen}
      type={state.type}
      title={state.title}
      message={state.message}
      placeholder={state.placeholder}
      defaultValue={state.defaultValue}
      options={state.options}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )

  return {
    alert,
    confirm,
    prompt,
    select,
    PopupComponent,
  }
}

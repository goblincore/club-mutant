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

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isOpen])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
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
      <div className="mt-popup" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="mt-popup-corner mt-popup-corner-tl" />
        <div className="mt-popup-corner mt-popup-corner-tr" />
        <div className="mt-popup-corner mt-popup-corner-bl" />
        <div className="mt-popup-corner mt-popup-corner-br" />

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
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleConfirm()
                }
              }}
            />
          )}

          {type === 'select' && options && (
            <select ref={selectRef} className="mt-popup-select" defaultValue={defaultValue}>
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
                ACKNOWLEDGE
              </button>
            ) : (
              <>
                <button className="mt-popup-btn mt-popup-btn-secondary" onClick={onCancel}>
                  ABORT
                </button>
                <button className="mt-popup-btn mt-popup-btn-primary" onClick={handleConfirm}>
                  CONFIRM
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-popup-scanlines" />
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


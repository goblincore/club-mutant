import { useRef, useEffect, useState, useCallback } from 'react'

import { useChatStore } from '../stores/chatStore'
import { getNetwork } from '../network/NetworkManager'

const CHAT_WIDTH = 400
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 MB

export function ChatInput() {
  const inputValue = useChatStore((s) => s.inputValue)
  const setInputValue = useChatStore((s) => s.setInputValue)

  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  // Background upload: stores the in-flight promise + resolved URL
  const uploadPromiseRef = useRef<Promise<string> | null>(null)
  const uploadedUrlRef = useRef<string | null>(null)
  const hasFileRef = useRef(false) // tracks whether a file is pending (avoids stale closure issues)

  // Clean up preview URL on unmount or change
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // Global Enter key to focus the chat input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      if (focused) return

      const target = e.target as HTMLElement | null
      const isTyping =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable

      if (isTyping) return

      e.preventDefault()
      e.stopPropagation()

      setFocused(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    }

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true })
  }, [focused])

  // Start uploading a file immediately in the background
  const selectFile = useCallback((file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return
    if (file.size > MAX_FILE_SIZE) return

    // Revoke old preview
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })

    hasFileRef.current = true
    uploadedUrlRef.current = null
    setUploading(true)

    // Start upload immediately — don't wait for send
    const promise = getNetwork().uploadImage(file)
    uploadPromiseRef.current = promise

    promise
      .then((url) => {
        uploadedUrlRef.current = url
        setUploading(false)
      })
      .catch((err) => {
        console.error('[chat] Background upload failed:', err)
        // Clear the pending file on failure
        hasFileRef.current = false
        uploadPromiseRef.current = null
        uploadedUrlRef.current = null
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return null
        })
        setUploading(false)
      })
  }, [])

  const clearPendingFile = useCallback(() => {
    hasFileRef.current = false
    uploadPromiseRef.current = null
    uploadedUrlRef.current = null
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setUploading(false)
  }, [])

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim()
    if (!trimmed && !hasFileRef.current) return

    let imageUrl: string | undefined

    // If there's a pending upload, wait for it to finish
    if (hasFileRef.current) {
      if (uploadedUrlRef.current) {
        // Already done uploading
        imageUrl = uploadedUrlRef.current
      } else if (uploadPromiseRef.current) {
        // Still uploading — wait for it
        setUploading(true)
        try {
          imageUrl = await uploadPromiseRef.current
        } catch {
          // Upload failed (error already handled in selectFile)
          setUploading(false)
          return
        }
        setUploading(false)
      }
      clearPendingFile()
    }

    getNetwork().sendChat(trimmed, imageUrl)
    setInputValue('')
  }, [inputValue, clearPendingFile, setInputValue])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
      // Keep focused after sending
      setFocused(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    }

    if (e.key === 'Escape') {
      if (hasFileRef.current) {
        clearPendingFile()
      } else {
        inputRef.current?.blur()
        setFocused(false)
      }
    }
  }

  // Paste handler for clipboard images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) selectFile(file)
          return
        }
      }
    },
    [selectFile]
  )

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)

      const file = e.dataTransfer.files?.[0]
      if (file && file.type.startsWith('image/')) {
        selectFile(file)
      }
    },
    [selectFile]
  )

  return (
    <div
      className="fixed bottom-0 left-1/2 -translate-x-1/2 pointer-events-none"
      style={{ zIndex: 20 }}
    >
      {/* Image preview above input */}
      {previewUrl && (
        <div className="pointer-events-auto flex items-center gap-2 mb-1 px-4" style={{ width: CHAT_WIDTH }}>
          <div className="relative">
            <img
              src={previewUrl}
              alt="pending upload"
              className="w-10 h-10 rounded object-cover border border-white/20"
            />
            <button
              onClick={clearPendingFile}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center leading-none hover:bg-red-400"
            >
              x
            </button>
          </div>
          {uploading && (
            <span className="text-white/50 text-[11px] font-mono">uploading...</span>
          )}
          {!uploading && uploadedUrlRef.current && (
            <span className="text-green-400/60 text-[11px] font-mono">ready</span>
          )}
        </div>
      )}

      <div
        style={{ width: CHAT_WIDTH }}
        className={`pointer-events-auto mx-4 mb-4 flex items-center bg-black/[0.75] backdrop-blur-md border transition-all duration-150 rounded-lg ${
          dragOver
            ? 'border-green-400/70 shadow-[0_0_8px_2px_rgba(74,222,128,0.4)]'
            : focused
              ? 'shadow-[0_0_8px_2px_rgba(255,255,255,0.6),0_0_20px_6px_rgba(200,230,255,0.3)] border-white/70'
              : 'border-white/[0.15]'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Chat icon */}
        <div className="py-2 pl-2 text-white/60 flex-shrink-0">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={handlePaste}
          placeholder={dragOver ? 'Drop image here' : hasFileRef.current ? 'Add a message or press Enter' : 'Press Enter to chat'}
          className="flex-1 bg-transparent py-2 px-3 text-[13px] text-white font-mono placeholder-white/50 focus:outline-none"
        />

        {/* Image upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-2 py-2 text-white/40 hover:text-white/70 transition-colors flex-shrink-0"
          title="Upload image"
          disabled={uploading}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) selectFile(file)
            e.target.value = '' // reset so same file can be re-selected
          }}
        />
      </div>
    </div>
  )
}

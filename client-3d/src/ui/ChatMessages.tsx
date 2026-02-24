import { useRef, useEffect, useState, useCallback } from 'react'
import { useChatStore, ChatMessage } from '../stores/chatStore'
import { useUIStore } from '../stores/uiStore'

const IMAGE_URL_REGEX = /https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?/gi
const CDN_URL_REGEX = /^https:\/\/cdn\.mutante\.club\//

/** Extract image URLs from message text content */
function extractImageUrls(content: string): string[] {
  if (!content) return []
  const matches = content.match(IMAGE_URL_REGEX)
  return matches ?? []
}

/** Block-level image — full container width, click to open */
function ChatImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const handleClick = useCallback(() => {
    window.open(src, '_blank', 'noopener')
  }, [src])

  if (error) return null

  return (
    <div className="mt-1.5 mb-1">
      {/* Shimmer placeholder — visible until image loads */}
      {!loaded && (
        <div className="w-full h-[140px] rounded bg-white/[0.06] animate-pulse" />
      )}
      {/* Image — uses opacity instead of hidden so browser actually loads it */}
      <img
        src={src}
        alt=""
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        onClick={handleClick}
        className={`w-full rounded border border-white/10 cursor-pointer hover:border-white/30 transition-opacity duration-200 object-cover ${
          loaded ? 'opacity-100' : 'opacity-0 h-0'
        }`}
        style={loaded ? { maxHeight: 300 } : undefined}
      />
    </div>
  )
}

/** Render message content, replacing detected image URLs with inline images */
function MessageContent({ msg }: { msg: ChatMessage }) {
  const hasUploadedImage = msg.imageUrl && CDN_URL_REGEX.test(msg.imageUrl)
  const contentImageUrls = extractImageUrls(msg.content)

  // Text with image URLs stripped out (if they'll be rendered as images)
  let displayText = msg.content
  if (contentImageUrls.length > 0) {
    for (const url of contentImageUrls) {
      displayText = displayText.replace(url, '').trim()
    }
  }

  const hasText = displayText.length > 0
  const hasAnyImage = hasUploadedImage || contentImageUrls.length > 0

  return (
    <>
      {hasText && (
        <span className="text-white/80 font-mono">: {displayText}</span>
      )}
      {!hasText && hasAnyImage && (
        <span className="text-white/40 font-mono italic"> sent an image</span>
      )}
      {/* CDN uploaded image */}
      {hasUploadedImage && <ChatImage src={msg.imageUrl!} />}
      {/* Detected image URLs in text */}
      {contentImageUrls.map((url, i) => (
        <ChatImage key={`${msg.id}-img-${i}`} src={url} />
      ))}
    </>
  )
}

export function ChatMessages() {
  const messages = useChatStore((s) => s.messages)
  const expanded = useUIStore((s) => s.rightPanelOpen)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto scroll to bottom (also re-scroll when images load by listening to DOM mutations)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, expanded])

  // Re-scroll when images load (they change scrollHeight)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new MutationObserver(() => {
      el.scrollTop = el.scrollHeight
    })
    observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-1 p-3 text-[13px]"
      >
        {messages.map((msg) => (
          <div key={msg.id} className="leading-tight hover:bg-white/[0.08] px-1 py-1 rounded">
            {msg.author === 'system' ? (
              <span className="text-white/70 italic">{msg.content}</span>
            ) : (
              <>
                <span className="text-green-300 font-bold">{msg.author}</span>
                <MessageContent msg={msg} />
              </>
            )}
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-white/40 text-center mt-4 font-mono">No messages yet</p>
        )}
      </div>
    </div>
  )
}

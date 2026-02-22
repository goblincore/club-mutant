import { useDreamClientStore } from '../stores/dreamClientStore'
import { sendToParent } from '../bridge/bridgeTypes'

/**
 * DreamHUD — Wake button + collectible count overlay.
 */
export function DreamHUD() {
  // Use scalar selectors to avoid reference equality issues with Set
  const collectedCount = useDreamClientStore((s) => s.collectedItems.size)
  const currentWorldId = useDreamClientStore((s) => s.currentWorldId)

  const handleWake = () => {
    sendToParent({ type: 'DREAM_WAKE' })
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: "'Courier New', monospace",
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        zIndex: 100,
        userSelect: 'none',
      }}
    >
      {/* World name */}
      <div style={{ textTransform: 'uppercase', letterSpacing: 2, fontSize: 10 }}>
        {currentWorldId}
      </div>

      {/* Collectibles */}
      {collectedCount > 0 && (
        <div style={{ fontSize: 11 }}>
          {collectedCount} collected
        </div>
      )}

      {/* Wake button */}
      <button
        onClick={handleWake}
        style={{
          marginTop: 8,
          padding: '4px 12px',
          background: 'transparent',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          borderRadius: 4,
          color: 'rgba(255, 255, 255, 0.5)',
          fontFamily: "'Courier New', monospace",
          fontSize: 11,
          cursor: 'pointer',
          textTransform: 'lowercase',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)'
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)'
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)'
        }}
      >
        wake up
      </button>
    </div>
  )
}

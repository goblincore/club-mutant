// Served as a static page from client-3d/public/blog/ — see _redirects for the
// rule that keeps the SPA catch-all from swallowing it.
const BLOG_URL = '/blog'

const DIM = 'rgba(255, 255, 255, 0.35)'
const BRIGHT = 'rgba(255, 255, 255, 0.7)'

// The version alone read as decoration, so nobody clicked it. The explicit
// link sits next to it to make the changelog discoverable.
export function VersionTag() {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        fontSize: 11,
        fontFamily: 'monospace',
        zIndex: 1000,
      }}
    >
      <span style={{ color: DIM }}>v{__APP_VERSION__}</span>
      <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>·</span>
      <a
        href={BLOG_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: 'rgba(255, 255, 255, 0.55)',
          textDecoration: 'none',
          borderBottom: '1px dotted rgba(255, 255, 255, 0.3)',
          cursor: 'pointer',
          transition: 'color 0.2s, border-color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = BRIGHT
          e.currentTarget.style.borderBottomColor = BRIGHT
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.55)'
          e.currentTarget.style.borderBottomColor = 'rgba(255, 255, 255, 0.3)'
        }}
      >
        view changelog
      </a>
    </div>
  )
}

const BLOG_URL = 'https://blog.mutante.club'

export function VersionTag() {
  return (
    <a
      href={BLOG_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        fontSize: 11,
        fontFamily: 'monospace',
        color: 'rgba(255, 255, 255, 0.35)',
        textDecoration: 'none',
        zIndex: 1000,
        cursor: 'pointer',
        transition: 'color 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.35)'
      }}
    >
      v{__APP_VERSION__}
    </a>
  )
}

import { useState } from 'react'
import filesystemData from '../../data/filesystem.json'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FsFile {
  type: 'file'
  content: string
}

interface FsFolder {
  type: 'folder'
  children: Record<string, FsFile | FsFolder>
}

type FsNode = FsFile | FsFolder

const filesystem = filesystemData as Record<string, FsFolder>

// ── Filesystem helpers ────────────────────────────────────────────────────────

function getNode(path: string): FsNode | null {
  // Normalise: ensure trailing slash for folders
  const normPath = path.endsWith('/') ? path : path + '/'

  // The root is "/home/victxrlarixs/"
  if (normPath === '/home/victxrlarixs/') {
    return filesystem['/home/victxrlarixs/'] ?? null
  }

  // Walk from root
  const root = filesystem['/home/victxrlarixs/']
  if (!root) return null

  // Strip the root prefix and split remaining segments
  const prefix = '/home/victxrlarixs/'
  if (!normPath.startsWith(prefix)) return null

  const relative = normPath.slice(prefix.length).replace(/\/$/, '')
  if (!relative) return root

  const segments = relative.split('/')
  let node: FsNode = root
  for (const seg of segments) {
    if (node.type !== 'folder') return null
    const child: FsNode | undefined = node.children[seg]
    if (!child) return null
    node = child
  }
  return node
}

function getParentPath(path: string): string {
  const normalised = path.endsWith('/') ? path.slice(0, -1) : path
  const lastSlash = normalised.lastIndexOf('/')
  if (lastSlash <= 0) return '/home/victxrlarixs/'
  const parent = normalised.slice(0, lastSlash + 1)
  // Don't go above root
  if (!parent.startsWith('/home/victxrlarixs/')) return '/home/victxrlarixs/'
  return parent
}

function getChildren(path: string): Record<string, FsNode> {
  const node = getNode(path)
  if (!node || node.type !== 'folder') return {}
  return node.children
}

// ── Icon helpers ──────────────────────────────────────────────────────────────

const FOLDER_ICON = '/icons/places/folder_open.png'
const MD_ICON = '/icons/mimetypes/document.png'
const FILE_ICON = '/icons/mimetypes/gtk-file.png'

function getIconSrc(name: string, nodeType: 'file' | 'folder'): string {
  if (nodeType === 'folder') return FOLDER_ICON
  if (name.endsWith('.md')) return MD_ICON
  return FILE_ICON
}

// ── Breadcrumbs ───────────────────────────────────────────────────────────────

function buildBreadcrumbs(path: string): Array<{ label: string; path: string }> {
  const crumbs: Array<{ label: string; path: string }> = []
  const prefix = '/home/victxrlarixs/'

  crumbs.push({ label: 'victxrlarixs', path: prefix })

  if (!path.startsWith(prefix)) return crumbs

  const relative = path.slice(prefix.length).replace(/\/$/, '')
  if (!relative) return crumbs

  const segments = relative.split('/')
  let accumulated = prefix
  for (const seg of segments) {
    accumulated += seg + '/'
    crumbs.push({ label: seg, path: accumulated })
  }
  return crumbs
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FileManager() {
  const [currentPath, setCurrentPath] = useState('/home/victxrlarixs/')
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [viewContent, setViewContent] = useState<string | null>(null)
  const [viewFileName, setViewFileName] = useState<string | null>(null)

  const children = getChildren(currentPath)
  const childEntries = Object.entries(children)
  const childCount = childEntries.length

  const breadcrumbs = buildBreadcrumbs(currentPath)

  // Top-level home children for sidebar
  const homeChildren = getChildren('/home/victxrlarixs/')
  const homeChildEntries = Object.entries(homeChildren)

  function navigateTo(path: string) {
    setCurrentPath(path)
    setSelectedItem(null)
    setViewContent(null)
    setViewFileName(null)
  }

  function goUp() {
    if (currentPath === '/home/victxrlarixs/') return
    navigateTo(getParentPath(currentPath))
  }

  function handleItemClick(name: string, node: FsNode) {
    if (node.type === 'folder') {
      const childPath = currentPath.endsWith('/')
        ? currentPath + name + '/'
        : currentPath + '/' + name + '/'
      navigateTo(childPath)
    } else {
      setSelectedItem(name)
      setViewContent(node.content)
      setViewFileName(name)
    }
  }

  function handleSidebarClick(name: string, node: FsNode) {
    if (node.type === 'folder') {
      const path = '/home/victxrlarixs/' + name + '/'
      navigateTo(path)
    } else {
      navigateTo('/home/victxrlarixs/')
      setSelectedItem(name)
      setViewContent(node.content)
      setViewFileName(name)
    }
  }

  function closeTextView() {
    setViewContent(null)
    setViewFileName(null)
    setSelectedItem(null)
  }

  return (
    <div className="fm-root">
      {/* Menu bar */}
      <div className="fm-menubar">
        <span>File</span>
        <span>Edit</span>
        <span>View</span>
        <span>Help</span>
      </div>

      {/* Toolbar */}
      <div className="fm-toolbar">
        <button
          className="fm-btn"
          onClick={goUp}
          title="Go Up"
          disabled={currentPath === '/home/victxrlarixs/'}
        >
          <img src="/icons/actions/go-up.png" alt="Up" onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none'
            e.currentTarget.parentElement!.textContent = '↑'
          }} />
        </button>

        <button
          className="fm-btn"
          onClick={closeTextView}
          title="File view"
          style={{ display: viewContent !== null ? undefined : 'none' }}
        >
          <img src="/icons/actions/go-previous.png" alt="Back" onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none'
            e.currentTarget.parentElement!.textContent = '←'
          }} />
        </button>

        {/* Path breadcrumbs */}
        <div className="fm-path-container">
          <div className="fm-breadcrumbs">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.path}>
                {i > 0 && <span className="fm-breadcrumb-separator">/</span>}
                <span
                  className="fm-breadcrumb-segment"
                  onClick={() => navigateTo(crumb.path)}
                >
                  {crumb.label}
                </span>
              </span>
            ))}
            {viewFileName && (
              <span>
                <span className="fm-breadcrumb-separator">/</span>
                <span className="fm-breadcrumb-segment">{viewFileName}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="fm-body">
        {/* Sidebar */}
        <div className="fm-sidebar">
          <div className="fm-section">Places</div>
          <div
            className="fm-item"
            onClick={() => navigateTo('/home/victxrlarixs/')}
          >
            <img
              src={FOLDER_ICON}
              alt="home"
              className="fm-icon"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <span>victxrlarixs</span>
          </div>

          {homeChildEntries.map(([name, node]) => (
            <div
              key={name}
              className="fm-item"
              onClick={() => handleSidebarClick(name, node)}
            >
              <img
                src={getIconSrc(name, node.type)}
                alt={name}
                className="fm-icon"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
              <span>{name}</span>
            </div>
          ))}
        </div>

        {/* Main area */}
        <div className="fm-main">
          {viewContent !== null ? (
            <div className="fm-text-view">
              <div className="fm-text-view-header">
                <button className="fm-text-back-btn" onClick={closeTextView}>
                  ← Back
                </button>
                <span className="fm-text-filename">{viewFileName}</span>
              </div>
              <pre className="fm-text-content">{viewContent}</pre>
            </div>
          ) : (
            <div className="fm-icon-grid">
              {childEntries.length === 0 ? (
                <div className="fm-empty">(empty folder)</div>
              ) : (
                childEntries.map(([name, node]) => (
                  <div
                    key={name}
                    className={`fm-file${selectedItem === name ? ' selected' : ''}`}
                    onClick={() => {
                      setSelectedItem(name)
                      if (node.type === 'file') {
                        setViewContent(node.content)
                        setViewFileName(name)
                      }
                    }}
                    onDoubleClick={() => handleItemClick(name, node)}
                  >
                    <img
                      src={getIconSrc(name, node.type)}
                      alt={name}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                    <span>{name}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="fm-status">
        {selectedItem !== null && viewContent === null
          ? selectedItem
          : viewFileName !== null
          ? viewFileName
          : `${childCount} object${childCount !== 1 ? 's' : ''}`}
      </div>
    </div>
  )
}

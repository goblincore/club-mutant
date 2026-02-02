import IconButton from '@mui/material/IconButton'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { RoomPlaylist } from './YoutubePlayer.styles'
import { RoomPlaylistItem } from '../stores/RoomPlaylistStore'

interface RoomPlaylistViewProps {
  items: RoomPlaylistItem[]
  currentIndex: number
  isRoomPlaylist: boolean
  mySessionId: string
  isNonDjPublic: boolean
  onRemove: (id: string) => void
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function RoomPlaylistView({
  items,
  currentIndex,
  isRoomPlaylist,
  mySessionId,
  isNonDjPublic,
  onRemove,
}: RoomPlaylistViewProps) {
  return (
    <RoomPlaylist>
      {items.length === 0 ? (
        <div className="row">
          <div className="title">No room tracks yet</div>
          <div className="meta">Add some from your playlist</div>
        </div>
      ) : (
        items.map((item, index) => {
          const canRemove = item.addedBySessionId === mySessionId
          const durationText = formatDuration(item.duration)
          const isActive = isRoomPlaylist && index === currentIndex
          const needsMarquee = item.title.length > 34

          return (
            <div key={item.id} className={isActive ? 'row active' : 'row'}>
              {needsMarquee ? (
                <div className="title marquee">
                  <div className="titleInner">{item.title}</div>
                </div>
              ) : (
                <div className="title">{item.title}</div>
              )}

              <div className="meta">{durationText}</div>

              {canRemove && !isNonDjPublic ? (
                <IconButton
                  aria-label="remove room playlist item"
                  size="small"
                  onClick={() => onRemove(item.id)}
                >
                  <DeleteOutlineIcon fontSize="inherit" />
                </IconButton>
              ) : null}
            </div>
          )
        })
      )}
    </RoomPlaylist>
  )
}

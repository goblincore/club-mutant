export enum RoomType {
  LOBBY = 'lobby',
  PUBLIC = 'clubmutant',
  CUSTOM = 'custom',
  MYROOM = 'myroom',
  JUKEBOX = 'jukebox',
}

export type MusicMode = 'djqueue' | 'jukebox' | 'personal'

export interface IRoomData {
  name: string
  description: string
  password: string | null
  autoDispose: boolean
  isPublic?: boolean
  musicMode?: MusicMode
}

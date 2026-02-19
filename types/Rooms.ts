export enum RoomType {
  LOBBY = 'lobby',
  PUBLIC = 'clubmutant',
  CUSTOM = 'custom',
  MYROOM = 'myroom',
}

export interface IRoomData {
  name: string
  description: string
  password: string | null
  autoDispose: boolean
  isPublic?: boolean
}

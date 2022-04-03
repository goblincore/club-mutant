import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { Player, PlaylistItem, DJUserInfo } from '../schema/OfficeState'
import { IOfficeState, IPlaylistItem, IDJUserInfo} from '../../../types/IOfficeState'
import { Message } from '../../../types/Messages'


type Payload = {
  client: Client
  item: IPlaylistItem 
}

export class MusicStreamNextCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    console.log("///////////////MusicStreamNextCommand, data", data)
    this.clock.clear()
    const musicStream = this.room.state.musicStream
    const musicBooths = this.room.state.musicBooths
    console.log('currentMusicstream booth', musicStream.currentBooth);
    musicStream.status = 'seeking'
    musicStream.currentLink = null
    // seeking the next link
    let startIndex: number = 0
    if (musicBooths.length > 1 && musicStream.currentBooth) {
      startIndex = musicStream.currentBooth
    } 

    if(this.room.state.musicBoothQueue?.length === 1) {
      startIndex = musicBooths.findIndex(musicbooth => musicbooth.connectedUser)
    }

    const nextMusicBooth = this.state.musicBoothQueue.shift();
    this.state.musicBoothQueue.push(nextMusicBooth);
    console.log('//MUSICBOOTHQUEUE', this.state.musicBoothQueue)
    console.log('//MUSICBOOTH CONNECTED USER', nextMusicBooth.connectedUser);

    console.log('//// music stream current start', startIndex);
    // console.log('///MUSICBOOTHS ALL', musicBooths);

    const filledMusicBooths = musicBooths.filter(musicbooth => musicbooth.connectedUser !== null);

    console.log('filledMusicBooths', filledMusicBooths);
    let nextBoothIndex = startIndex;

  console.log('/////NEXT BOOTH INDEX', nextBoothIndex);

       // if no other players and not playing
      //  if (data?.item) {
   
          const musicBooth = musicBooths[nextBoothIndex]
          if (nextMusicBooth.connectedUser !== null) {
            const player = this.room.state.players.get(nextMusicBooth.connectedUser)
         

            console.log('//MUSICBOOTH PLAYER', 'INDEX BOOTH', nextBoothIndex, 'playerId', player.name);
            if(data.item && data.item?.link && nextMusicBooth.connectedUser === data.item.djId){
              console.log('//////////DATA ITEM', data.item);
              const newItem = new PlaylistItem()
              newItem.title = data.item.title
              newItem.link = data.item.link
              newItem.djId = data.item.djId
              newItem.duration = data.item.duration
              
              player.nextTwoPlaylist.setAt(1, newItem);
            }
         
            if (player.nextTwoPlaylist.length > 0) {
              const playbackItem = player.nextTwoPlaylist.shift();
              const djInfo = new DJUserInfo();
              djInfo.name = player.name
              djInfo.sessionId = playbackItem.djId
              musicStream.status = 'playing'
              musicStream.currentLink = playbackItem.link
              musicStream.currentBooth = nextBoothIndex
              musicStream.currentDj = djInfo
              musicStream.currentTitle = playbackItem.title
              musicStream.startTime = Date.now()
              musicStream.duration =  playbackItem.duration
              console.log("//////////////////////MusicStreamNextCommand, musicStream.currentLink", musicStream.currentLink)
              this.room.broadcast(
                Message.START_MUSIC_STREAM,
                { musicStream: musicStream, offset: 0 },
              )
              this.clock.setTimeout(() => {
                this.room.clients.forEach((client) => {
                  if (client.sessionId === nextMusicBooth.connectedUser) {
                    // client.send(Message.SYNC_MUSIC_STREAM, {})
                  }
                })
              }, musicStream.duration * 1000);
            }
          }
        

    console.log("//////////////////////MusicStreamNextCommand, musicStream.status", musicStream.status)
    // else stop music stream, broadcast message to room
    if (musicStream.status !== 'playing') {
      musicStream.status = 'waiting'
      this.room.broadcast(
        Message.STOP_MUSIC_STREAM,
        {},
      )
      console.log("///////////////MusicStreamNextCommand, broadcast, STOP_MUSIC_STREAM")
    }
  }
}

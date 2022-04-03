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
    const musicStream = this.state.musicStream
    const musicBooths = this.state.musicBooths
    const musicBoothQueue = this.state.musicBoothQueue
    console.log('currentMusicstream booth', musicStream.currentBooth);
    musicStream.status = 'seeking'
    musicStream.currentLink = null
    // seeking the next link
    let startIndex: number = 0
    if (musicBooths.length > 1 && musicStream.currentBooth) {
      startIndex = musicStream.currentBooth
    } 

    if(this.state.musicBoothQueue?.length === 1) {
      startIndex = musicBoothQueue[0]
    }

    const musicBoothQueueClone = this.state.musicBoothQueue.clone()
    console.log('///FIRST MUSIC QUEUE ITEM', this.state.musicBoothQueue[0]);
    const nextMusicBoothIndex = musicBoothQueueClone.shift();
    musicBoothQueueClone.push(nextMusicBoothIndex);
    this.state.musicBoothQueue = musicBoothQueueClone;
    console.log('///FIRST MUSIC QUEUE ITEM MUTATED', this.state.musicBoothQueue[0]);
    console.log('///NEXT MUSIC BOOTH INDEX', nextMusicBoothIndex);
    console.log('//MUSICBOOTHQUEUE', this.state.musicBoothQueue)
    console.log('//MUSICBOOTH CONNECTED USER', musicBooths[nextMusicBoothIndex].connectedUser);

    console.log('//// music stream current start', startIndex);
    // console.log('///MUSICBOOTHS ALL', musicBooths);


    let nextBoothIndex = this.state.musicBoothQueue?.length === 1 ?  musicBoothQueue[0] : this.state.musicBoothQueue[0];

  console.log('/////NEXT BOOTH INDEX', nextBoothIndex);

   
          const musicBooth = musicBooths[this.state.musicBoothQueue[0]]
          if (musicBooth.connectedUser !== null) {
            const player: Player = this.state.players.get(musicBooth.connectedUser)
         

            console.log('//MUSICBOOTH PLAYER', 'INDEX BOOTH', nextBoothIndex, 'playerId', player.name, 'id', player);
            if(this.state.musicBoothQueue?.length === 1 && data.item && data.item?.link &&  data.client.sessionId === data.item.djId ){
              console.log('//////////DATA ITEM', data.item);
              const newItem = new PlaylistItem()
              newItem.title = data.item.title
              newItem.link = data.item.link
              newItem.djId = data.item.djId
              newItem.duration = data.item.duration
              
              player.nextTwoPlaylist.setAt(0, newItem);
            }

            console.log('player.nextTwoPlaylist length', player.nextTwoPlaylist.length)
         
            if (player.nextTwoPlaylist.length > 0) {
              
              const playbackItem = player.nextTwoPlaylist[0]
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
              player.nextTwoPlaylist.shift()
              console.log("//////////////////////MusicStreamNextCommand, musicStream.currentLink", musicStream.currentLink)
              this.room.broadcast(
                Message.START_MUSIC_STREAM,
                { musicStream: musicStream, offset: 0 },
              )
              this.clock.setTimeout(() => {
                this.room.clients.forEach((client) => {
                  if (client.sessionId === musicBooths[nextMusicBoothIndex].connectedUser) {
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

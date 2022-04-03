import http from 'http'
import express from 'express'
import cors from 'cors'
import { Server, LobbyRoom } from 'colyseus'
import { monitor } from '@colyseus/monitor'
import { WebSocketTransport } from "@colyseus/ws-transport";
// import socialRoutes from "@colyseus/social/express"
import * as yt from 'youtube-search-without-api-key'

import * as youtube from './Youtube';
import { RoomType } from '../types/Rooms'

import { SkyOffice } from './rooms/SkyOffice'

const port = Number(process.env.PORT || 2567)
const app = express()

app.use(cors())
app.use(express.json())
// app.use(express.static('dist'))

const server = http.createServer(app)
const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
    pingInterval: 5000,
    pingMaxRetries: 3,
})
})

// register room handlers
gameServer.define(RoomType.LOBBY, LobbyRoom)
gameServer.define(RoomType.PUBLIC, SkyOffice, {
  name: 'Public Lobby',
  description: 'For making friends and familiarizing yourself with the controls',
  password: null,
  autoDispose: false,
})
gameServer.define(RoomType.CUSTOM, SkyOffice).enableRealtimeListing()

/**
 * Register @colyseus/social routes
 *
 * - uncomment if you want to use default authentication (https://docs.colyseus.io/server/authentication/)
 * - also uncomment the import statement
 */
// app.use("/", socialRoutes);

// register colyseus monitor AFTER registering your room handlers
app.use('/colyseus', monitor())

gameServer.listen(port)
console.log(`Listening on ws://localhost:${port}`)

app.get('/youtube/:search', async (req, res, next) => {
  const { search } = req.params;
  console.log('///////////////app.get(/youtube/:search)', search);
  try {
    // We will be coding here
    // const videos = await yt.search('dj lostboi')
    const videos = await youtube.GetData(search, false, 24);
    res.json(videos)
  } catch (e) {
    console.log('///////////////app.get(/youtube/:search), catch, e', e)
    return next(e);
  }
})



import http from 'http'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import { Server, LobbyRoom } from 'colyseus'
import { monitor } from '@colyseus/monitor'
// import socialRoutes from "@colyseus/social/express"

import * as youtube from './Youtube'
import { searchYouTube, resolveYouTubeVideo, proxyYouTubeVideo } from './youtubeService'
import { RoomType } from '../types/Rooms'

import { ClubMutant } from './rooms/ClubMutant'

const port = Number(process.env.PORT || 2567)
const app = express()

app.use(cors())
app.use(express.json())
// app.use(express.static('dist'))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

const server = http.createServer(app)
const gameServer = new Server({ server })

// register room handlers
gameServer.define(RoomType.LOBBY, LobbyRoom)
gameServer.define(RoomType.PUBLIC, ClubMutant, {
  name: 'Public Lobby',
  description: 'For making friends and familiarizing yourself with the controls',
  password: null,
  autoDispose: false,
  isPublic: true,
})
gameServer.define(RoomType.CUSTOM, ClubMutant).enableRealtimeListing()

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

app.get('/youtube/resolve/:videoId', async (req: Request, res: Response, next: NextFunction) => {
  const { videoId } = req.params

  try {
    const resolved = await resolveYouTubeVideo(videoId)
    res.json(resolved)
  } catch (e) {
    console.error('[youtube] Resolve failed for', videoId, e)
    res.status(500).json({ error: 'Failed to resolve video' })
  }
})

app.get('/youtube/proxy/:videoId', async (req: Request, res: Response, next: NextFunction) => {
  const { videoId } = req.params
  const range = typeof req.headers.range === 'string' ? req.headers.range : undefined

  try {
    await proxyYouTubeVideo(videoId, range, res)
  } catch (e) {
    console.error('[youtube] Proxy failed for', videoId, e)
    res.status(500).json({ error: 'Failed to proxy video' })
  }
})

app.get('/youtube/:search', async (req: Request, res: Response, next: NextFunction) => {
  const { search } = req.params
  console.log('[youtube] search:', search)

  try {
    const videos = await searchYouTube(search, 24)
    res.json(videos)
  } catch (e) {
    console.log('[youtube] Go service failed, falling back to legacy scraping')

    try {
      const videos = await youtube.GetData(search, false, 24)
      res.json(videos)
    } catch (fallbackError) {
      console.log('[youtube] Legacy fallback also failed:', fallbackError)
      return next(fallbackError)
    }
  }
})

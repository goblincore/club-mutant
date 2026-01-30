import http from 'http'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import axios from 'axios'
import { Server, LobbyRoom } from 'colyseus'
import { monitor } from '@colyseus/monitor'
// import socialRoutes from "@colyseus/social/express"

import * as youtube from './Youtube'
import { resolveYoutubeVideoUrl } from './youtubeResolver'
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
    console.log('[youtube] Go service resolve failed, falling back to yt-dlp')

    try {
      const resolved = await resolveYoutubeVideoUrl(videoId)
      res.json(resolved)
    } catch (fallbackError) {
      if (fallbackError instanceof Error && fallbackError.message === 'invalid videoId') {
        res.status(400).json({ error: 'invalid videoId' })
        return
      }

      return next(fallbackError)
    }
  }
})

app.get('/youtube/proxy/:videoId', async (req: Request, res: Response, next: NextFunction) => {
  const { videoId } = req.params
  const range = typeof req.headers.range === 'string' ? req.headers.range : undefined

  try {
    await proxyYouTubeVideo(videoId, range, res)
  } catch (e) {
    console.log('[youtube] Go service proxy failed, falling back to yt-dlp + axios')

    try {
      const resolved = await resolveYoutubeVideoUrl(videoId)

      const headers: Record<string, string> = {}
      if (range) {
        headers.Range = range
      }

      const upstream = await axios.get(resolved.url, {
        responseType: 'stream',
        headers,
        validateStatus: (status) => status >= 200 && status < 400,
        maxRedirects: 5,
      })

      res.status(upstream.status)

      const passthroughHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control',
      ] as const

      for (const header of passthroughHeaders) {
        const value = upstream.headers[header] as unknown

        if (typeof value === 'string') {
          res.setHeader(header, value)
          continue
        }

        if (typeof value === 'number') {
          res.setHeader(header, String(value))
          continue
        }

        if (Array.isArray(value)) {
          res.setHeader(header, value.map(String).join(', '))
        }
      }

      upstream.data.pipe(res)
    } catch (fallbackError) {
      return next(fallbackError)
    }
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

import express from 'express'
import helmet from 'helmet'
import { defineServer, defineRoom, LobbyRoom, matchMaker, logger } from 'colyseus'
import { uWebSocketsTransport } from '@colyseus/uwebsockets-transport'

// Allowed CORS origins
const ALLOWED_ORIGINS = [
  'https://mutante.club',
  'http://localhost:5173',
  'http://localhost:5175',
  'http://localhost:5176', // dream client dev server
  'http://localhost:4173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
  'http://127.0.0.1:3000',
]

// Set CORS headers for Colyseus matchmaker routes
// Note: getCorsHeaders receives requestHeaders object, not full request
// IMPORTANT: Cannot use '*' with credentials:true - must echo specific origin
matchMaker.controller.getCorsHeaders = function (requestHeaders) {
  const getOrigin = (headers: unknown): string | undefined => {
    if (!headers) return undefined

    const maybeHeaders = headers as {
      get?: (key: string) => string | null
    }

    if (typeof maybeHeaders.get === 'function') {
      return maybeHeaders.get('origin') ?? maybeHeaders.get('Origin') ?? undefined
    }

    const record = headers as Record<string, unknown>
    const originValue = record?.origin ?? record?.Origin
    if (typeof originValue === 'string') return originValue
    if (Array.isArray(originValue) && typeof originValue[0] === 'string') return originValue[0]

    return undefined
  }

  const origin = getOrigin(requestHeaders)

  if (process.env.NODE_ENV !== 'production') {
    console.log('[CORS] matchmaker origin:', origin)
  }

  // Non-browser callers (Node.js loadtest, server-to-server) don't send an Origin header.
  // Return permissive CORS without credentials for these — CORS is browser-only enforcement.
  // IMPORTANT: Must explicitly set Access-Control-Allow-Credentials to '' because the
  // uWebSockets transport merges DEFAULT_CORS_HEADERS (which has credentials:'true') via
  // Object.assign before our headers. Without this override, the merged result would be
  // Origin:* + Credentials:true — an illegal CORS combo that Node.js 22 fetch rejects.
  if (!origin) {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
      'Access-Control-Allow-Credentials': '',
    }
  }

  // Browser callers: echo back the specific origin (can't use * with credentials)
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '2592000',
  }
}

process.on('unhandledRejection', (reason, promise) => {
  if (reason === undefined) {
    console.warn('[colyseus] Suppressing undefined rejection (known Colyseus 0.17 issue)')
    return
  }
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

import * as youtube from './Youtube'
import { searchYouTube, resolveYouTubeVideo, proxyYouTubeVideo } from './youtubeService'
import { RoomType } from '@club-mutant/types/Rooms'

import { ClubMutant } from './rooms/ClubMutant'

// Enable realtime listing on CUSTOM rooms so LobbyRoom broadcasts room events
const customRoomHandler = defineRoom(ClubMutant)
customRoomHandler.enableRealtimeListing()

// Jukebox rooms also get realtime listing so they show in the room browser
const jukeboxRoomHandler = defineRoom(ClubMutant)
jukeboxRoomHandler.enableRealtimeListing()

const server = defineServer({
  transport: new uWebSocketsTransport({
    maxPayloadLength: 1024 * 1024, // 1MB max message size
  }),

  rooms: {
    [RoomType.LOBBY]: defineRoom(LobbyRoom),
    [RoomType.PUBLIC]: defineRoom(ClubMutant, {
      name: 'Public Lobby',
      description: 'For making friends and familiarizing yourself with the controls',
      password: null,
      autoDispose: false,
      isPublic: true,
    }),
    [RoomType.CUSTOM]: customRoomHandler,
    [RoomType.MYROOM]: defineRoom(ClubMutant, {
      name: 'My Room',
      description: 'Personal tatami room',
      password: null,
      autoDispose: true,
      isPublic: false,
      musicMode: 'personal',
    }),
    [RoomType.JUKEBOX]: jukeboxRoomHandler,
  },

  express: (app) => {
    // CORS is handled per-layer:
    // - Matchmaker routes: via matchMaker.controller.getCorsHeaders
    // - Dream NPC chat: moved to standalone dream-npc service (port 4000)
    // - YouTube routes: called server-to-server, no browser CORS needed
    // Don't add global CORS middleware here — it conflicts with uWebSockets transport.
    app.use(helmet())
    app.disable('x-powered-by')
    app.use(express.json())

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' })
    })

    app.get('/youtube/resolve/:videoId', async (req, res) => {
      const videoId = req.params.videoId

      try {
        const resolved = await resolveYouTubeVideo(videoId)
        res.json(resolved)
      } catch (e) {
        console.error('[youtube] Resolve failed for', videoId, e)
        res.status(500).json({ error: 'Failed to resolve video' })
      }
    })

    app.get('/youtube/proxy/:videoId', async (req, res) => {
      const videoId = req.params.videoId
      const rangeHeader = req.headers.range

      try {
        await proxyYouTubeVideo(videoId, rangeHeader, res)
      } catch (e) {
        console.error('[youtube] Proxy failed for', videoId, e)
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to proxy video' })
        }
      }
    })

    app.get('/youtube/:search', async (req, res) => {
      const search = req.params.search
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
          res.status(500).json({ error: 'Search failed' })
        }
      }
    })
  },
})

// Call server.listen() directly — avoids @colyseus/tools' listen() which can
// create a duplicate @colyseus/core singleton under pnpm, causing rooms to not register.
const port = Number(process.env.PORT || 2567)
server.listen(port).then(() => {
  logger.info(`⚔️  Listening on http://localhost:${port}`)
})

import express from 'express'
import { defineServer, defineRoom, LobbyRoom, matchMaker } from 'colyseus'
import { listen } from '@colyseus/tools'
import { uWebSocketsTransport } from '@colyseus/uwebsockets-transport'

// Allowed CORS origins
const ALLOWED_ORIGINS = [
  'https://mutante.club',
  'http://localhost:5173',
  'http://localhost:5175',
  'http://localhost:4173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5175',
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

  // Echo back the origin if in allowlist, otherwise use production URL
  // (Cannot use '*' when credentials are enabled)
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : 'https://mutante.club'

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
    [RoomType.CUSTOM]: defineRoom(ClubMutant),
  },

  express: (app) => {
    // CORS is handled by matchMaker.controller.getCorsHeaders - don't add duplicate middleware
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

// Use @colyseus/tools listen() which handles CORS automatically
listen(server)

import express from 'express'
import cors from 'cors'
import { defineServer, defineRoom, LobbyRoom, matchMaker } from 'colyseus'
import { listen } from '@colyseus/tools'
import { uWebSocketsTransport } from '@colyseus/uwebsockets-transport'

// Allowed CORS origins
const ALLOWED_ORIGINS = [
  'https://mutante.club',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
]

// CORS options for Express middleware
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true)
    } else {
      console.log('[CORS] Blocked origin:', origin)
      callback(null, false)
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
}

// Set CORS headers for Colyseus matchmaker routes
// Note: getCorsHeaders receives requestHeaders object, not full request
// IMPORTANT: Cannot use '*' with credentials:true - must echo specific origin
matchMaker.controller.getCorsHeaders = function (requestHeaders) {
  const headers = requestHeaders as unknown as Record<string, string>
  const origin = headers?.origin

  // Echo back the origin if in allowlist, otherwise use first allowed origin
  // (Cannot use '*' when credentials are enabled)
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : 'http://localhost:5173'

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
    // CORS middleware - must be first for preflight handling
    app.use(cors(corsOptions))
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

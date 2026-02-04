import express from 'express'
import { defineServer, defineRoom, LobbyRoom, matchMaker } from 'colyseus'
import { listen } from '@colyseus/tools'
import { uWebSocketsTransport } from '@colyseus/uwebsockets-transport'

// Set CORS headers for Colyseus matchmaker routes
matchMaker.controller.getCorsHeaders = function (req) {
  const origin = req?.headers?.origin || 'https://mutante.club'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
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
    // CORS handled by Caddy reverse proxy - don't add duplicate headers
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

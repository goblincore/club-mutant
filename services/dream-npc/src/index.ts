import express from 'express'
import cors from 'cors'
import { handleNpcChat } from './dreamNpc.js'

const app = express()
const PORT = Number(process.env.PORT || 4000)

// CORS — allow dream client dev server + production origin
app.use(
  cors({
    origin: [
      'http://localhost:5176',
      'http://localhost:5175',
      'http://127.0.0.1:5176',
      'http://127.0.0.1:5175',
      'https://mutante.club',
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
)

app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'dream-npc' })
})

app.post('/dream/npc-chat', async (req, res) => {
  const body = req.body
  // Use IP as session key for rate limiting
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const sessionKey = `dream:${ip}`

  try {
    const result = await handleNpcChat(body, sessionKey)
    res.status(result.status).json(result.body)
  } catch (e) {
    console.error('[dreamNpc] Handler error:', e)
    res.status(500).json({ error: 'Internal error' })
  }
})

app.listen(PORT, () => {
  console.log(`🌙 Dream NPC service listening on http://localhost:${PORT}`)
})

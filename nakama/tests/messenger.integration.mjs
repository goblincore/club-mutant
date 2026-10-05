// Disposable fixtures on local dev Nakama only. Run from the repository root:
// node nakama/tests/messenger.integration.mjs
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../client-3d/package.json', import.meta.url))
const { Client } = require('@heroiclabs/nakama-js')
const client = new Client('clubmutant_dev', '127.0.0.1', '7350', false)
const sessions = []
const sockets = []
const suffix = randomUUID().slice(0, 8)
function event(socket, name, filter = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} did not arrive`)), 8000)
    socket[name] = (value) => { if (filter(value)) { clearTimeout(timer); resolve(value) } }
  })
}
async function rpc(session, name, payload = {}) {
  return (await client.rpc(session, name, payload)).payload
}
try {
  for (const label of ['sender', 'recipient']) sessions.push(await client.authenticateDevice(`messenger-qa-${label}-${suffix}`, true, `qa_${label}_${suffix}`))
  const [sender, recipient] = sessions
  for (const session of sessions) {
    const socket = client.createSocket(false)
    sockets.push(socket)
    await socket.connect(session, true)
  }
  const body = ('A complete message with a cozy little computer. ').repeat(7) + 'THE REAL ENDING'
  const receivedPromise = event(sockets[1], 'onnotification', (n) => n.code === 100)
  const sent = await rpc(sender, 'send_message', { recipient_id: recipient.user_id, subject: 'dm', body })
  const notification = await receivedPromise
  assert.equal(notification.content.body, body)
  assert.equal(notification.content.messageId, sent.messageId)
  assert.equal(notification.content.createdAt, sent.createdAt)
  const saved = await rpc(recipient, 'get_messages', { other_user_id: sender.user_id })
  assert.equal(saved.messages[0].body, body)
  assert.equal(saved.messages[0].messageId, sent.messageId)
  let conversations = await rpc(recipient, 'list_conversations')
  assert.equal(conversations.conversations[0].unreadCount, 1)
  await rpc(recipient, 'send_message', { recipient_id: sender.user_id, subject: 'dm', body: 'a reply before marking read' })
  conversations = await rpc(recipient, 'list_conversations')
  assert.equal(conversations.conversations[0].unreadCount, 1, 'sending must not silently clear unread')
  await rpc(recipient, 'mark_read', { other_user_id: sender.user_id })
  assert.equal((await rpc(recipient, 'list_conversations')).conversations[0].unreadCount, 0)

  const channels = await Promise.all([sockets[0].joinChat(recipient.user_id, 2, false, true), sockets[1].joinChat(sender.user_id, 2, false, true)])
  const typingPromise = event(sockets[1], 'onchannelmessage', (m) => m.content.type === 'typing')
  await sockets[0].writeChatMessage(channels[0].id, { type: 'typing' })
  assert.equal((await typingPromise).sender_id, sender.user_id)
  sockets[1].disconnect(false)
  const reconnected = client.createSocket(false)
  sockets.push(reconnected)
  await reconnected.connect(recipient, true)
  await reconnected.joinChat(sender.user_id, 2, false, true)
  const afterReconnect = event(reconnected, 'onnotification', (n) => n.code === 100)
  await rpc(sender, 'send_message', { recipient_id: recipient.user_id, subject: 'dm', body: 'hello after reconnect' })
  assert.equal((await afterReconnect).content.body, 'hello after reconnect')

  // A mixed raw storage page with 49 matches followed by 50 more previously
  // lost 49 messages when the RPC trimmed its response but advanced its cursor.
  const objects = Array.from({ length: 120 }, (_, index) => ({
    collection: 'dm_messages', key: `0000000000000_qa_${String(index).padStart(3, '0')}`,
    permission_read: 1, permission_write: 0,
    value: { messageId: `qa-${index}`, senderId: index === 49 ? 'other' : sender.user_id,
      recipientId: recipient.user_id, senderUsername: 'qa', body: `history ${index}`, createdAt: index },
  }))
  await client.writeStorageObjects(recipient, objects)
  const history = []
  let cursor
  let pageCount = 0
  do {
    const page = await rpc(recipient, 'get_messages', { other_user_id: sender.user_id, cursor })
    history.push(...page.messages)
    cursor = page.cursor
    pageCount++
  } while (cursor)
  assert.equal(new Set(history.filter((m) => m.messageId.startsWith('qa-')).map((m) => m.messageId)).size, 119)
  console.log(`PASS: full realtime body, stored history, unread/read state, typing, reconnect, ${history.length} messages across ${pageCount} RPC pages without gaps.`)
} finally {
  for (const socket of sockets) socket.disconnect(false)
  // These accounts were created by this test, exclusively on 127.0.0.1.
  for (const session of sessions) await client.deleteAccount(session)
}

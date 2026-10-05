// Disposable local dev accounts only. Run: node nakama/tests/postbox.integration.mjs
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../client-3d/package.json', import.meta.url))
const { Client } = require('@heroiclabs/nakama-js')
const client = new Client('clubmutant_dev', '127.0.0.1', '7350', false)
const suffix = randomUUID().slice(0, 8)
const sessions = []
const sockets = []
const rpc = async (s, name, p = {}) => (await client.rpc(s, name, p)).payload
try {
  for (const label of ['sender','recipient','stranger']) sessions.push(await client.authenticateDevice(`postbox-qa-${label}-${suffix}`,true,`post_${label}_${suffix}`))
  const [sender, recipient, stranger] = sessions
  const socket = client.createSocket(false); sockets.push(socket); await socket.connect(recipient,true)
  const notified = new Promise((resolve,reject) => {
    const timeout=setTimeout(()=>reject(Error('Letter notification did not arrive')),8000)
    socket.onnotification=(n)=> {if(n.code===101) {clearTimeout(timeout);resolve(n)}}
  })
  notified.catch(()=>{})
  const request = { request_id: randomUUID(), to: recipient.username, subject: 'A little <hello> & goodbye', body: 'Dear friend,\n\n'.repeat(220)+'THE END' }
  const first = await rpc(sender,'send_letter',request)
  assert.equal((await notified).content.letterId,first.letter.id)
  const retry = await rpc(sender,'send_letter',request)
  assert.equal(first.letter.id,retry.letter.id,'retry must return the same delivered letter')
  await assert.rejects(rpc(sender,'send_letter',{...request,body:'Edited after an uncertain delivery'}),'retry with changed content must not erase the unsent edits')
  const inbox=(await rpc(recipient,'list_letters')).letters
  assert.equal(inbox.length,1);assert.equal(inbox[0].folder,'inbox');assert.equal(inbox[0].read,false)
  assert.equal(inbox[0].body,request.body);assert.equal(inbox[0].subject,request.subject)
  assert.equal((await rpc(sender,'list_letters')).letters[0].folder,'sent')
  assert.equal((await rpc(recipient,'list_conversations')).conversations.length,0,'letters must not create Messenger threads')
  assert.equal((await rpc(recipient,'update_letter',{id:first.letter.id,action:'read'})).letter.read,true)
  assert.equal((await rpc(recipient,'update_letter',{id:first.letter.id,action:'trash'})).letter.folder,'trash')
  assert.equal((await rpc(recipient,'update_letter',{id:first.letter.id,action:'restore'})).letter.folder,'inbox')
  await assert.rejects(rpc(recipient,'update_letter',{id:first.letter.id,action:'delete'}))
  await assert.rejects(rpc(stranger,'update_letter',{id:first.letter.id,action:'trash'}))
  assert.equal((await rpc(stranger,'list_letters')).letters.length,0)
  await assert.rejects(client.writeStorageObjects(recipient,[{collection:'postbox_letters',key:first.letter.id,value:{body:'tampered'},permission_read:1,permission_write:1}]))
  await rpc(recipient,'update_letter',{id:first.letter.id,action:'trash'})
  await rpc(recipient,'update_letter',{id:first.letter.id,action:'delete'})
  assert.equal((await rpc(recipient,'list_letters')).letters.length,0)
  assert.equal((await rpc(sender,'list_letters')).letters.length,1,'recipient deletion must leave the sender copy intact')
  await rpc(sender,'update_letter',{id:first.letter.id,action:'trash'})
  await rpc(sender,'update_letter',{id:first.letter.id,action:'delete'})
  await assert.rejects(rpc(sender,'send_letter',request),'deleted Sent copy must not allow redelivery')
  await assert.rejects(rpc(sender,'send_letter',{...request,request_id:randomUUID(),to:'not_here_'+suffix}))
  await assert.rejects(rpc(sender,'send_letter',{...request,request_id:randomUUID(),body:'x'.repeat(10001)}))
  // Concurrent submissions with the same draft are also delivered once.
  const concurrent={...request,request_id:randomUUID()}
  const results=await Promise.all([rpc(sender,'send_letter',concurrent),rpc(sender,'send_letter',concurrent)])
  assert.equal(results[0].letter.id,results[1].letter.id)
  assert.equal((await rpc(recipient,'list_letters')).letters.length,1)
  console.log('PASS: real letter delivery/notification, full content, sequential/concurrent retry deduplication, independent folders/read/trash/restore/delete, user isolation, write protection, missing recipients and limits.')
} finally {
  for(const socket of sockets) socket.disconnect(false)
  for(const session of sessions) await client.deleteAccount(session)
}

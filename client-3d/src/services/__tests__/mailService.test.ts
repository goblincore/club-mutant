import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock=vi.hoisted(()=>({rpc:vi.fn(),notifications:new Set<(n:any)=>void>(),sockets:new Set<(s:any)=>void>(),owner:'me'}))
vi.mock('../../network/nakamaClient',()=>({postboxRpc:mock.rpc,onNotification:(cb:any)=>{mock.notifications.add(cb);return()=>mock.notifications.delete(cb)},onSocketChange:(cb:any)=>{mock.sockets.add(cb);return()=>mock.sockets.delete(cb)}}))
vi.mock('../../stores/authStore',()=>({useAuthStore:{getState:()=>({userId:mock.owner})}}))
import { createMailService } from '../mailService'
beforeEach(()=>{vi.clearAllMocks();mock.owner='me';mock.notifications.clear();mock.sockets.clear()})
describe('Postbox transport',()=>{
 it('loads all pages, deduplicates letters and sorts newest first',async()=>{
   const letter=(id:string,createdAt:number)=>({id,createdAt})
   mock.rpc.mockResolvedValueOnce({letters:[letter('old',1)],cursor:'a'}).mockResolvedValueOnce({letters:[],cursor:'b'}).mockResolvedValueOnce({letters:[letter('new',2),letter('old',1)]})
   expect((await createMailService().listLetters()).map((l)=>l.id)).toEqual(['new','old'])
   expect(mock.rpc.mock.calls.map((a)=>a[1])).toEqual([{}, {cursor:'a'}, {cursor:'b'}])
 })
 it('rejects repeated cursors and account changes',async()=>{
   mock.rpc.mockResolvedValue({letters:[],cursor:'same'})
   await expect(createMailService().listLetters()).rejects.toThrow('refresh')
   mock.rpc.mockImplementationOnce(async()=>{mock.owner='other';return {letters:[]}})
   await expect(createMailService().listLetters()).rejects.toThrow('Account changed')
 })
 it('retains the draft request ID and full body for safe retries',async()=>{
   const letter={id:'sent'};mock.rpc.mockResolvedValue({letter})
   const input={requestId:'draft-id',to:' @mika ',subject:'A hello',body:'hello '.repeat(500)}
   expect(await createMailService().sendLetter(input)).toEqual(letter)
   expect(mock.rpc).toHaveBeenCalledWith('send_letter',{request_id:'draft-id',to:'mika',subject:input.subject,body:input.body})
 })
 it('refreshes only for letters and reconnects, and unsubscribes cleanly',()=>{
   const changed=vi.fn();const unsubscribe=createMailService().onMailChanged(changed)
   mock.notifications.forEach((cb)=>cb({code:100}));expect(changed).not.toHaveBeenCalled()
   mock.notifications.forEach((cb)=>cb({code:101}));mock.sockets.forEach((cb)=>cb({}))
   expect(changed).toHaveBeenCalledTimes(2);unsubscribe();expect(mock.notifications.size).toBe(0);expect(mock.sockets.size).toBe(0)
 })
})

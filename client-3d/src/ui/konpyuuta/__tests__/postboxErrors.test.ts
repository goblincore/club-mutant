import { describe, it, expect } from 'vitest'
import { postboxErrorText } from '../../../../../packages/konpyuuta/src/lib/postbox'
describe('Postbox delivery errors',()=>{
 it('extracts Nakama response errors and removes server stack details',async()=>{
   const error=new Response(JSON.stringify({message:'That username could not be found at sendLetterRpc (index.js:972:32(184))'}),{status:500})
   expect(await postboxErrorText(error)).toBe('That username could not be found')
 })
 it('keeps a useful fallback for unavailable delivery and failed connections',async()=>{
   expect(await postboxErrorText(new Response('',{status:404}))).toContain('Your draft is saved')
   expect(await postboxErrorText({})).toContain('couldn’t reach')
   expect(await postboxErrorText(new Error('Try again later.'))).toBe('Try again later.')
 })
})

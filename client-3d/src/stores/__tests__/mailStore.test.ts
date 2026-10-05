import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
const { useMailStore } = await import('../../../../packages/konpyuuta/src/stores/mailStore')
const store = () => useMailStore.getState()
const letter = { id:'server-letter',from:'mika',to:'coco',subject:'Hi',body:'<hello> & goodbye',read:false,folder:'inbox' as const,originalFolder:'inbox' as const,createdAt:123,delivered:true as const }
beforeEach(() => {useMailStore.setState({ownerId:null,accounts:{},messages:[],selectedMessageId:null,activeDraftId:null,currentFolder:'inbox'});store().resetForUser('coco-id')})
describe('Postbox regressions', () => {
 it('keeps draft text while navigating, syncing and switching accounts', () => {
   const id=store().startDraft('coco',{to:'mika',subject:'Hi',body:'My letter'})
   store().setCurrentFolder('inbox');store().mergeLetters('coco-id',[letter])
   expect(store().messages.find((m)=>m.id===id)?.body).toBe('My letter')
   store().resetForUser('mika-id');expect(store().messages).toEqual([])
   store().mergeLetters('coco-id',[letter]);expect(store().messages).toEqual([])
   store().resetForUser('coco-id');store().openDraft(id)
   expect(store().activeDraftId).toBe(id)
   expect(store().messages.find((m)=>m.id===id)?.body).toBe('My letter')
 })
 it('removes a draft only after a successful server acknowledgement', () => {
   const id=store().startDraft('coco',{body:'Don’t lose me'})
   expect(store().messages.find((m)=>m.id===id)).toBeDefined()
   store().finishSend('other',id,{...letter,folder:'sent',originalFolder:'sent'})
   expect(store().messages.find((m)=>m.id===id)).toBeDefined()
   store().finishSend('coco-id',id,{...letter,folder:'sent',originalFolder:'sent'})
   expect(store().messages.find((m)=>m.id===id)).toBeUndefined()
   expect(store().currentFolder).toBe('sent')
 })
 it('restores a trashed draft to Drafts with its text intact', () => {
   const id=store().startDraft('coco',{body:'Recover this'})
   store().moveLocalMessage(id);expect(store().messages[0].folder).toBe('trash')
   store().moveLocalMessage(id,true);expect(store().messages[0]).toMatchObject({folder:'drafts',body:'Recover this'})
 })
 it('recovers old local letters explicitly without claiming delivery or duplicating them', () => {
   const archive=[{id:'old-draft',from:'me',to:'mika',subject:'My old draft',body:'Keep this text',folder:'drafts',read:true,createdAt:42}]
   store().importLocalArchive(archive,'coco');store().importLocalArchive(archive,'coco')
   expect(store().messages).toHaveLength(1)
   expect(store().messages[0]).toMatchObject({from:'coco',body:'Keep this text',delivered:false,legacySourceId:'old-draft'})
   expect(store().messages[0].id).toMatch(/^[a-f0-9-]{36}$/)
   store().openDraft(store().messages[0].id);expect(store().activeDraftId).toBeTruthy()
 })
 it('keeps folder/read updates and deletions isolated to the active account', () => {
   store().mergeLetters('coco-id',[letter]);store().setSelectedMessage(letter.id)
   store().putLetter('wrong',{...letter,read:true});expect(store().messages[0].read).toBe(false)
   store().removeMessage('wrong',letter.id);expect(store().messages).toHaveLength(1)
   store().putLetter('coco-id',{...letter,folder:'trash'});expect(store().selectedMessageId).toBeNull()
   store().setCurrentFolder('trash');store().setSelectedMessage(letter.id)
   store().removeMessage('coco-id',letter.id);expect(store().messages).toEqual([]);expect(store().selectedMessageId).toBeNull()
 })
})

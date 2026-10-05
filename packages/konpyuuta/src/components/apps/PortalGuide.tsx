import { PORTAL_ICONS } from '../../lib/socialIcons'

export function PortalGuide({ guides = false }: { guides?: boolean }) {
  return <article className="portal-reading">
    <img src={PORTAL_ICONS[guides ? 'guides' : 'help']} alt="" />
    <h1>{guides ? 'Club Mutant guides' : 'Getting around'}</h1>
    {guides ? <p>Navigation guides and tutorials are coming soon.</p> : <dl>
      <dt>Open an app</dt><dd>Select a floating icon. Its movement pauses when you hover or focus it.</dd>
      <dt>Come back</dt><dd>Home returns to the icons. Your apps are ready to reopen.</dd>
      <dt>Quick message</dt><dd>Friends in the upper bar opens Messenger’s buddy list. Choose a contact, then use Back to return to the list.</dd>
      <dt>Resize</dt><dd>Drag a window’s lower corner. You can also focus the corner and use the arrow keys; Shift changes the size in larger steps.</dd>
      <dt>Sound</dt><dd>The speaker in the upper bar switches interface sounds on or off.</dd>
      <dt>Return to the club</dt><dd>The power button leaves this screen.</dd>
    </dl>}
  </article>
}

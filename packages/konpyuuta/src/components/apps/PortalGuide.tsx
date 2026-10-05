import { PORTAL_ICONS } from '../../lib/socialIcons'

export function PortalGuide({ guides = false }: { guides?: boolean }) {
  return <article className="portal-reading">
    <img src={PORTAL_ICONS[guides ? 'guides' : 'help']} alt="" />
    <h1>{guides ? 'Club Mutant guides' : 'Getting around'}</h1>
    {guides ? <p>Navigation guides and tutorials are coming soon.</p> : <dl>
      <dt>Open an app</dt><dd>Select a floating icon. Its movement pauses when you hover or focus it.</dd>
      <dt>Come back</dt><dd>Home returns to the icons. Your apps are ready to reopen.</dd>
      <dt>Sound</dt><dd>The speaker in the upper bar switches interface sounds on or off.</dd>
      <dt>Return to the club</dt><dd>The power button leaves this screen.</dd>
    </dl>}
  </article>
}

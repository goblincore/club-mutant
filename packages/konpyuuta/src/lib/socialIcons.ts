// Let Vite fingerprint these assets so desktop, dock, and app manager share
// the same URLs in development and production, independent of /icons routing.
import mutanttube from '../../public/icons/apps/mutanttube.png?url'
import mutantbook from '../../public/icons/apps/mutantbook.png?url'
import messenger from '../../public/icons/apps/messenger.png?url'
import mutantmail from '../../public/icons/apps/mutantmail.png?url'
import tubeLoop from '../../public/icons/apps/mutanttube.webp?url'
import bookLoop from '../../public/icons/apps/mutantbook.webp?url'
import messengerLoop from '../../public/icons/apps/messenger.webp?url'
import mailLoop from '../../public/icons/apps/mutantmail.webp?url'

export const SOCIAL_ICONS = { mutanttube, mutantbook, messenger, mutantmail }
export const SOCIAL_ICON_LOOPS = { mutanttube: tubeLoop, mutantbook: bookLoop, messenger: messengerLoop, mutantmail: mailLoop }
import netscape from '../../public/icons/apps/netscape.png?url'
import netscapeLoop from '../../public/icons/apps/netscape.webp?url'
import settings from '../../public/icons/apps/settings.png?url'
import settingsLoop from '../../public/icons/apps/settings.webp?url'
import filemanager from '../../public/icons/apps/filemanager.png?url'
import filemanagerLoop from '../../public/icons/apps/filemanager.webp?url'

export const DESKTOP_ICONS = { ...SOCIAL_ICONS, netscape, settings, filemanager }
export const DESKTOP_ICON_LOOPS = { ...SOCIAL_ICON_LOOPS, netscape: netscapeLoop, settings: settingsLoop, filemanager: filemanagerLoop }

import help from '../../public/icons/apps/help.png?url'
import helpLoop from '../../public/icons/apps/help.webp?url'
import guides from '../../public/icons/apps/guides.png?url'
import guidesLoop from '../../public/icons/apps/guides.webp?url'

// Help and Guides are packaged from the same Blender material/lighting setup.
export const PORTAL_ICONS = { ...SOCIAL_ICONS, help, guides }
export const PORTAL_ICON_LOOPS = { ...SOCIAL_ICON_LOOPS, help: helpLoop, guides: guidesLoop }

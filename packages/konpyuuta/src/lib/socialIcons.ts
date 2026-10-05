// Let Vite fingerprint these assets so desktop, dock, and app manager share
// the same URLs in development and production, independent of /icons routing.
import mutanttube from '../../public/icons/apps/mutanttube.svg?url'
import mutantbook from '../../public/icons/apps/mutantbook.svg?url'
import messenger from '../../public/icons/apps/messenger.svg?url'
import mutantmail from '../../public/icons/apps/mutantmail.svg?url'

export const SOCIAL_ICONS = { mutanttube, mutantbook, messenger, mutantmail }

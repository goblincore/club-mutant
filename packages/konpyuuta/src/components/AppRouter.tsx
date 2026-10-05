import { MutantTube } from './apps/MutantTube'
import { MutantBook } from './apps/MutantBook'
import { Messenger } from './apps/Messenger'
import { MutantMail } from './apps/MutantMail'
import { PortalGuide } from './apps/PortalGuide'

interface AppRouterProps { windowId?: string; app: string; props?: Record<string, unknown> }
export function AppRouter({ app, windowId }: AppRouterProps) {
  switch (app) {
    case 'mutanttube': return <MutantTube />
    case 'mutantbook': return <MutantBook />
    case 'messenger': return <Messenger windowId={windowId} />
    case 'mutantmail': return <MutantMail />
    case 'help': return <PortalGuide />
    case 'guides': return <PortalGuide guides />
    default: return null
  }
}

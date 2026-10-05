import { Settings } from './apps/Settings'
import { NetscapeNavigator } from './apps/NetscapeNavigator'
import { FileManager } from './apps/FileManager'
import { Lynx } from './apps/Lynx'
import { ProcessMonitor } from './apps/ProcessMonitor'
import { Calendar } from './apps/Calendar'
import { AppManager } from './apps/AppManager'
import { ManViewer } from './apps/ManViewer'
import { Screenshot } from './apps/Screenshot'
import { MutantTube } from './apps/MutantTube'
import { MutantBook } from './apps/MutantBook'
import { Messenger } from './apps/Messenger'
import { MutantMail } from './apps/MutantMail'

interface AppRouterProps {
  windowId?: string
  app: string
  props?: Record<string, unknown>
}

export function AppRouter({ app, windowId, props: _props }: AppRouterProps) {
  switch (app) {
    case 'settings':
      return <Settings />

    case 'netscape':
      return <NetscapeNavigator />

    case 'filemanager':
      return <FileManager />

    case 'lynx':
      return <Lynx />

    case 'processmonitor':
      return <ProcessMonitor />

    case 'calendar':
      return <Calendar />

    case 'appmanager':
      return <AppManager />

    case 'manviewer':
      return <ManViewer />

    case 'screenshot':
      return <Screenshot />

    case 'mutanttube':
      return <MutantTube />

    case 'mutantbook':
      return <MutantBook />

    case 'messenger':
      return <Messenger windowId={windowId} />

    case 'mutantmail':
      return <MutantMail />

    default:
      return (
        <div className="cde-app-placeholder">
          <p>{app}</p>
        </div>
      )
  }
}

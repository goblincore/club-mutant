import { Settings } from './apps/Settings'
import { NetscapeNavigator } from './apps/NetscapeNavigator'
import { FileManager } from './apps/FileManager'
import { Lynx } from './apps/Lynx'
import { ProcessMonitor } from './apps/ProcessMonitor'
import { Calendar } from './apps/Calendar'
import { AppManager } from './apps/AppManager'
import { ManViewer } from './apps/ManViewer'

interface AppRouterProps {
  app: string
  props?: Record<string, unknown>
}

export function AppRouter({ app, props: _props }: AppRouterProps) {
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

    default:
      return (
        <div className="cde-app-placeholder">
          <p>{app}</p>
        </div>
      )
  }
}

export interface OS5kAppDef {
  id: string
  icon: string
  name: string
  src: string        // path relative to /os5000k/
  width: number
  height: number
  description: string
}

export const OS5K_APPS: OS5kAppDef[] = [
  { id: 'profile',    icon: '\u{1F464}', name: 'Profile',    src: 'apps/profile.html',    width: 400, height: 350, description: 'View your profile or look up other players.' },
  { id: 'friends',    icon: '\u{1F46B}', name: 'Friends',    src: 'apps/friends.html',    width: 400, height: 450, description: 'See your friends and who is online.' },
  { id: 'mail',       icon: '\u{1F4EC}', name: 'Mail',       src: 'apps/mail.html',       width: 500, height: 400, description: 'Send and receive messages.' },
  { id: 'mutantbook', icon: '\u{1F4D8}', name: 'MutantBook', src: 'apps/mutantbook.html', width: 480, height: 500, description: 'View profiles, post on walls, connect with friends.' },
  { id: 'mutanttube', icon: '\u{1F4FA}', name: 'MutantTube', src: 'apps/mutanttube.html', width: 560, height: 480, description: 'Search videos, build playlists, discover music.' },
  { id: 'settings', icon: '⚙️', name: 'Settings', src: 'apps/settings.html', width: 380, height: 420, description: 'Change wallpaper, display settings, and preferences.' },
]

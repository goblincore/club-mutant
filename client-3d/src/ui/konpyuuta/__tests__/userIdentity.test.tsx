import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { KonpyuuTAProvider } from '../../../../../packages/konpyuuta/src/context/KonpyuuTAContext'
import { FileManager } from '../../../../../packages/konpyuuta/src/components/apps/FileManager'
import { ProcessMonitor } from '../../../../../packages/konpyuuta/src/components/apps/ProcessMonitor'
import { personalizeUserJson, personalizeUsername } from '../../../../../packages/konpyuuta/src/lib/userIdentity'
import bootMessages from '../../../../../packages/konpyuuta/src/data/boot-messages.json'
import tutorial from '../../../../../packages/konpyuuta/src/data/tutorial.json'

describe('KonpyuuTA account identity', () => {
  it.each(['mika', 'poppy'])('shows %s as the home and process owner', (username) => {
    const html = renderToStaticMarkup(<KonpyuuTAProvider env={{}} username={username}><FileManager /><ProcessMonitor /></KonpyuuTAProvider>)
    expect(html).toContain(`<span>${username}</span>`)
    expect(html).toContain(`<span class="pm-col-user">${username}</span>`)
    expect(html).toContain('<span class="pm-col-user">root</span>')
    expect(html).toContain('<span class="pm-col-user">www-data</span>')
    expect(html).not.toContain('{{username}}')
  })

  it('uses a guest identity when no account is available', () => {
    const html = renderToStaticMarkup(<KonpyuuTAProvider env={{}}><FileManager /><ProcessMonitor /></KonpyuuTAProvider>)
    expect(html).toContain('<span>guest</span>')
    expect(html).toContain('<span class="pm-col-user">guest</span>')
  })

  it('personalizes boot and tutorial text while preserving valid JSON', () => {
    const username = 'mika$&"'
    const boot = JSON.parse(personalizeUserJson(bootMessages, username))
    const messages = boot.phases.flatMap((phase: { messages: { text: string }[] }) => phase.messages)
    expect(messages.some((message: { text: string }) => message.text === `Loading user profile: ${username}`)).toBe(true)
    const lessons = JSON.parse(personalizeUserJson(tutorial, username)).lessons
    expect(lessons[0].steps[0].user).toBe(username)
    expect(lessons[0].steps[0].output).toBe(`${username}\nShows current user`)
    expect(lessons[0].steps[1].output).toBe(`/home/${username}\nShows current directory`)
    expect(personalizeUsername('{{username}}/{{username}}', username)).toBe(`${username}/${username}`)
  })
})

import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import { readFileSync } from 'fs'

const rootPkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  integrations: [mdx()],
  site: 'https://blog.mutante.club',
  vite: {
    define: {
      __APP_VERSION__: JSON.stringify(rootPkg.version),
    },
  },
})

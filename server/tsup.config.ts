import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'lib',
  clean: true,
  sourcemap: true,
  // Don't bundle dependencies - they're installed separately
  external: [
    'express',
    'cors',
    'colyseus',
    '@colyseus/command',
    '@colyseus/core',
    '@colyseus/monitor',
    '@colyseus/schema',
    '@colyseus/tools',
    '@colyseus/uwebsockets-transport',
    'bcrypt',
    'uuid',
    'uwebsockets-express',
    '@club-mutant/types',
  ],
  // Copy JS files that aren't TypeScript
  onSuccess: 'cp src/Youtube.js src/Queue.js lib/',
})

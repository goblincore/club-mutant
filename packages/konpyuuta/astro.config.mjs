// packages/konpyuuta/astro.config.mjs
import { defineConfig } from 'astro/config';

const BASE = '/konpyuuta';

export default defineConfig({
  base: BASE,
  output: 'static',
  vite: {
    define: {
      'import.meta.env.PUBLIC_APP_VERSION': JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
      // DEFAULT_BACKDROP uses absolute path — served by Vite plugin at /backdrops/*
      'import.meta.env.DEFAULT_BACKDROP': JSON.stringify('/backdrops/SkyDarkTall.pm'),
    },
  },
});

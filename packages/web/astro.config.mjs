// @ts-check
import { defineConfig } from 'astro/config';

import preact from '@astrojs/preact';

// https://astro.build/config
export default defineConfig({
  // Static-first: prerender everything to ./dist and serve via
  // Cloudflare Workers static assets. No adapter needed.
  output: 'static',

  vite: {
    build: {
      // Keep -webkit-backdrop-filter for Safari <= 17 (unprefixed only landed
      // in Safari 18): default modern targets let the minifier strip the
      // prefix, violating CLAUDE.md's locked glass spec.
      cssTarget: ['chrome100', 'safari15', 'firefox115', 'edge100'],
    },
  },

  integrations: [preact()],
});
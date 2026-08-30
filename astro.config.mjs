// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Static-first: prerender everything to ./dist and serve via
  // Cloudflare Workers static assets. No adapter needed.
  output: 'static',
});

import { defineConfig } from 'wxt';

/**
 * Gil & Bricks MV3 side-panel extension (E4 scaffold).
 *
 * The manifest is pinned to the sprint spec: MV3, Chrome 114+, ONLY the
 * sidePanel + storage permissions, host access to Rightmove/Zoopla ONLY, a
 * module service worker, and a strict CSP (script-src 'self'; object-src 'self')
 * — OCR was removed in E9.1, so no wasm-unsafe-eval. WXT fills in the mechanical parts
 * (manifest_version, side_panel.default_path from the sidepanel entrypoint,
 * background.service_worker + type:module from the background entrypoint).
 */
export default defineConfig({
  // Chrome MV3 is the only target we ship.
  manifest: {
    name: 'Gil & Bricks Deal Analyser',
    description: 'Analyse a Rightmove or Zoopla listing as a deal — in a side panel.',
    minimum_chrome_version: '114',
    // NOTE: no tabs / cookies / scripting / webRequest / <all_urls>. See README + DECISIONS_LOG.
    permissions: ['sidePanel', 'storage'],
    host_permissions: ['*://*.rightmove.co.uk/*', '*://*.zoopla.co.uk/*'],
    // (SW type:module is set on the background entrypoint via defineBackground.)
    action: { default_title: 'Gil & Bricks Deal Analyser' },
    icons: { 16: 'icon/16.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    // OCR was removed (E9.1); with no wasm/worker in the panel the CSP is tightened
    // back to the strict default — no wasm-unsafe-eval, no worker-src.
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  },
});

/**
 * maplibre-gl v6 loads its worker from a URL; under Vite bundling the default
 * resolution points inside our hashed chunk, so we self-host the worker pair
 * verbatim and setWorkerUrl() to it (src/components/analyser/mapImpl.ts).
 * Runs as part of `npm run build` so the copy always matches the installed
 * maplibre version.
 */
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('public/map/vendor', { recursive: true });
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(`node_modules/maplibre-gl/dist/${f}`, `public/map/vendor/${f}`);
}
console.log('map worker assets copied');

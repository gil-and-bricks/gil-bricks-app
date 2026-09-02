/**
 * maplibre-gl v6 loads its worker from a URL; under Vite bundling the default
 * resolution points inside our hashed chunk, so we self-host the worker pair
 * verbatim and setWorkerUrl() to it (src/components/analyser/mapImpl.ts).
 * Runs as part of `npm run build` so the copy always matches the installed
 * maplibre version. Resolves maplibre-gl via Node's module resolution so it
 * works whether the dep is hoisted to the workspace root or local.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
// package.json is always resolvable; the dist files sit beside it.
const distDir = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist');

mkdirSync('public/map/vendor', { recursive: true });
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(join(distDir, f), `public/map/vendor/${f}`);
}
console.log('map worker assets copied');

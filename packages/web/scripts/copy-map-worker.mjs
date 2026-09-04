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
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// package.json is always resolvable; the dist files sit beside it.
const distDir = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist');

// anchored to this script, never to the shell's cwd
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'map', 'vendor');
mkdirSync(outDir, { recursive: true });
// The stylesheet is copied too (N3): mapImpl loads it itself on FIRST MOUNT, so
// a page where nobody opens the map never pays its 83KB. Importing it from the
// module would make the bundler hoist a render-blocking <link> onto every page.
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl.css']) {
  copyFileSync(join(distDir, f), join(outDir, f));
}
console.log('map worker assets copied');

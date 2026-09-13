/**
 * The render gate, with a server this script owns.
 *
 *   npm run render-gate -w packages/web
 *
 * Same shape as the copy gate and for the same reason: the server lives inside
 * this process, so when the script ends the socket closes and there is nothing
 * left to leak. See scripts/lib/serve-dist.mjs.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startDistServer } from './lib/serve-dist.mjs';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.RENDER_GATE_PORT ?? 4323);

let server = null;
try {
  server = await startDistServer({ dist: join(WEB, 'dist'), port: PORT, name: 'render-gate' });
} catch (err) {
  console.error(err.message);
  process.exit(2);
}
console.log(`render-gate: serving packages/web/dist on ${server.url}`);

let check = null;
let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  if (check !== null && check.exitCode === null) check.kill('SIGTERM');
  server.close();
};
process.on('exit', shutdown);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { shutdown(); process.exit(1); });
}

check = spawn(
  process.execPath,
  [join(WEB, 'scripts', 'check-render.mjs'), server.url, ...process.argv.slice(2)],
  { cwd: WEB, stdio: 'inherit' },
);
check.on('exit', (code) => { shutdown(); process.exit(code ?? 1); });

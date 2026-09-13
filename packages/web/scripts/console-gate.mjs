/**
 * The console gate, with a server this script owns — and which serves the REAL
 * security headers, so a header fault is visible here instead of in production.
 * Same shape as the copy and render gates; see scripts/lib/serve-dist.mjs.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startDistServer } from './lib/serve-dist.mjs';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.CONSOLE_GATE_PORT ?? 4324);

let server = null;
try {
  server = await startDistServer({ dist: join(WEB, 'dist'), port: PORT, name: 'console-gate' });
} catch (err) { console.error(err.message); process.exit(2); }
console.log(`console-gate: serving packages/web/dist on ${server.url} (with public/_headers applied)`);

let check = null;
let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  if (check !== null && check.exitCode === null) check.kill('SIGTERM');
  server.close();
};
process.on('exit', shutdown);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { shutdown(); process.exit(1); });

check = spawn(process.execPath, [join(WEB, 'scripts', 'check-console.mjs'), server.url, ...process.argv.slice(2)], { cwd: WEB, stdio: 'inherit' });
check.on('exit', (code) => { shutdown(); process.exit(code ?? 1); });

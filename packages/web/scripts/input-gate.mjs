/**
 * The input gate, with a server this script owns. Runs against the LOCAL build
 * so it gates a pull request; it needs no Worker, only the sold-price data the
 * browser fetches for itself.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startDistServer } from './lib/serve-dist.mjs';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.INPUT_GATE_PORT ?? 4325);

let server = null;
try { server = await startDistServer({ dist: join(WEB, 'dist'), port: PORT, name: 'input-gate' }); }
catch (err) { console.error(err.message); process.exit(2); }
console.log(`input-gate: serving packages/web/dist on ${server.url}`);

let check = null; let closing = false;
const shutdown = () => { if (closing) return; closing = true; if (check?.exitCode === null) check.kill('SIGTERM'); server.close(); };
process.on('exit', shutdown);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { shutdown(); process.exit(1); });

check = spawn(process.execPath, [join(WEB, 'scripts', 'check-inputs.mjs'), server.url, ...process.argv.slice(2)], { cwd: WEB, stdio: 'inherit' });
check.on('exit', (code) => { shutdown(); process.exit(code ?? 1); });

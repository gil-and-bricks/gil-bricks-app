/**
 * The copy gate, with a server this script actually owns.
 *
 *   npm run copy-gate -w packages/web
 *
 * WHY THIS EXISTS. The gate needs the built site served somewhere, and the way
 * that was done — background the preview server, poll the port, and leave it to
 * be killed afterwards — has no owner. CI never had a kill step at all; it
 * relied on the runner being torn down. Run the same shape by hand and nothing
 * tears anything down: an `astro preview` from a local gate run survived seven
 * hours, because the `pkill -f "astro preview"` aimed at it never matched the
 * real command line ("astro.mjs preview") and its exit code was never checked.
 *
 * So there is no background process and no pattern to get wrong. The server is
 * an ordinary `node:http` listener INSIDE this process — see
 * scripts/lib/serve-dist.mjs, which the render gate shares — and when this
 * script ends, for any reason at all, the operating system closes its socket.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startDistServer } from './lib/serve-dist.mjs';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.COPY_GATE_PORT ?? 4321);

let server = null;
try {
  server = await startDistServer({ dist: join(WEB, 'dist'), port: PORT, name: 'copy-gate' });
} catch (err) {
  // Plain English, not a stack trace: the operator is not technical, and the
  // only thing they can do about a busy port is free it or pick another one.
  console.error(err.message);
  if (/already using port/.test(err.message)) {
    console.error(`Run with a different port: COPY_GATE_PORT=4322 npm run copy-gate -w packages/web`);
  }
  process.exit(2);
}
console.log(`copy-gate: serving packages/web/dist on ${server.url}`);

/**
 * Close on the way out, whatever the way out is — and take the browser with us.
 * The socket would go anyway when this process dies; the child is killed by the
 * name of its own handle, never by a pattern match, so it cannot be missed.
 */
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
  [join(WEB, 'scripts', 'check-copy-length.mjs'), server.url, ...process.argv.slice(2)],
  { cwd: WEB, stdio: 'inherit' },
);
check.on('exit', (code) => {
  shutdown();
  process.exit(code ?? 1);
});

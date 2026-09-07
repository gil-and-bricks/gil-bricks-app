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
 * an ordinary `node:http` listener INSIDE this process: when this script ends,
 * for any reason at all, the operating system closes its socket. There is
 * nothing left to leak, and nothing to remember to clean up.
 *
 * It serves packages/web/dist exactly as Cloudflare's static assets do — a
 * directory becomes its index.html, a query string is ignored, a miss becomes
 * the real 404 page — so what the browser measures is what a visitor gets.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize } from 'node:path';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(WEB, 'dist');
const PORT = Number(process.env.COPY_GATE_PORT ?? 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.pmtiles': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
};

/** dist is missing → say so plainly rather than measuring an empty site. */
try {
  await stat(join(DIST, 'index.html'));
} catch {
  console.error('copy-gate: packages/web/dist has no index.html — run `npm run build` first.');
  process.exit(2);
}

/** The file a URL path resolves to, the way the static host resolves it. */
async function resolve(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const direct = join(DIST, clean);
  if (extname(clean) !== '') {
    return direct;
  }
  // A directory is its index.html — with or without the trailing slash.
  return join(direct, 'index.html');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const file = await resolve(url.pathname);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    // The real 404 page, at the real status — a gate that measured a blank
    // response would pass a page that no longer exists.
    //
    // Read the body BEFORE writing the head. Writing the head first and then
    // awaiting made the plain-text fallback unreachable: if that read failed,
    // the second writeHead threw ERR_HTTP_HEADERS_SENT from inside an async
    // handler, which in Node is fatal — the whole server died instead of
    // serving 'Not Found'.
    let body = null;
    try {
      body = await readFile(join(DIST, '404.html'));
    } catch {
      body = null;
    }
    if (body === null) {
      res.writeHead(404, { 'content-type': TYPES['.txt'] });
      res.end('Not Found');
    } else {
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      res.end(body);
    }
  }
});

try {
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(PORT, '127.0.0.1', ok);
  });
} catch (err) {
  // Plain English, not a stack trace: the operator is not technical, and the
  // only thing they can do about this is free the port or pick another one.
  if (err?.code === 'EADDRINUSE') {
    console.error(`copy-gate: something is already using port ${PORT}.`);
    console.error(`Stop it, or run with a different port: COPY_GATE_PORT=4322 npm run copy-gate -w packages/web`);
  } else {
    console.error(`copy-gate: could not start the server on port ${PORT} — ${err?.message ?? err}`);
  }
  process.exit(2);
}
console.log(`copy-gate: serving packages/web/dist on http://localhost:${PORT}`);

/**
 * Close on the way out, whatever the way out is — and take the browser with us.
 * The socket would go anyway when this process dies; the child is killed by name
 * of its own handle, never by a pattern match, so it cannot be missed.
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
  [join(WEB, 'scripts', 'check-copy-length.mjs'), `http://localhost:${PORT}`, ...process.argv.slice(2)],
  { cwd: WEB, stdio: 'inherit' },
);
check.on('exit', (code) => {
  shutdown();
  process.exit(code ?? 1);
});

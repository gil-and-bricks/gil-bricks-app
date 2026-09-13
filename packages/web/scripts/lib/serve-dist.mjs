/**
 * The built site, served the way Cloudflare's static assets serve it, from
 * INSIDE the calling process.
 *
 * Extracted from copy-gate.mjs so a second gate does not need a second copy of
 * it. The reasoning it carries is copy-gate's and still applies: there is no
 * background process and no pattern to get wrong. When the caller ends, for any
 * reason, the operating system closes the socket — nothing leaks and there is
 * nothing to remember to clean up. (A backgrounded `astro preview` once
 * survived seven hours because the `pkill` aimed at it never matched.)
 *
 * A directory becomes its index.html, a query string is ignored, and a miss
 * becomes the real 404 page — so what a gate measures is what a visitor gets.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';

/**
 * THE HEADERS THE REAL HOST SENDS.
 *
 * This server used to send a content-type and nothing else. Every gate that
 * ran against it therefore ran with NO Content-Security-Policy — which is
 * precisely why a policy that blocked every listing photograph and every floor
 * plan sailed through the local gates twice. A gate that cannot see the headers
 * cannot see a header fault, and the only reason one was ever caught was that
 * it happened to be pointed at production that day.
 *
 * public/_headers is what Cloudflare's asset layer applies to every static
 * page, so it is what this serves too. Parsed, not hardcoded: the gate and the
 * deployment read the same file, so they cannot drift.
 */
function parseHeadersFile(text) {
  const blocks = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: raw.trim(), headers: [] };
      blocks.push(current);
      continue;
    }
    const i = raw.indexOf(':');
    if (current !== null && i > 0) {
      current.headers.push([raw.slice(0, i).trim().toLowerCase(), raw.slice(i + 1).trim()]);
    }
  }
  return blocks;
}

/** Cloudflare's matching, in the one form this file uses: a trailing `*`. */
function headersFor(blocks, pathname) {
  const out = {};
  for (const b of blocks) {
    const p = b.pattern;
    const hit = p.endsWith('*') ? pathname.startsWith(p.slice(0, -1)) : pathname === p;
    if (hit) for (const [k, v] of b.headers) out[k] = v;
  }
  return out;
}

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

/** The file a URL path resolves to, the way the static host resolves it. */
function resolve(dist, pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const direct = join(dist, clean);
  return extname(clean) !== '' ? direct : join(direct, 'index.html');
}

/**
 * Start it. Throws a plain-English Error the caller can print — the operator is
 * not technical and the only thing they can do about a busy port is free it.
 */
export async function startDistServer({ dist, port, name }) {
  try {
    await stat(join(dist, 'index.html'));
  } catch {
    throw new Error(`${name}: ${dist} has no index.html — run \`npm run build\` first.`);
  }

  // public/_headers sits beside dist, not inside it: it is a build instruction,
  // not an asset. Missing is fatal — a gate that silently ran without the real
  // policy is the fault this exists to close.
  const headersPath = join(dirname(dist), 'public', '_headers');
  let blocks = [];
  try {
    blocks = parseHeadersFile(await readFile(headersPath, 'utf8'));
  } catch {
    throw new Error(`${name}: could not read ${headersPath} — the gate must serve the real headers, not none.`);
  }
  if (!blocks.some((b) => b.headers.some(([k]) => k === 'content-security-policy'))) {
    throw new Error(`${name}: ${headersPath} names no Content-Security-Policy — refusing to run a gate that cannot see one.`);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    try {
      const file = resolve(dist, url.pathname);
      const body = await readFile(file);
      res.writeHead(200, {
        ...headersFor(blocks, url.pathname),
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      });
      res.end(body);
    } catch {
      // Read the body BEFORE writing the head: writing first and then awaiting
      // made the plain-text fallback unreachable, and a second writeHead throws
      // ERR_HTTP_HEADERS_SENT from inside an async handler, which in Node kills
      // the whole server rather than serving 'Not Found'.
      let body = null;
      try { body = await readFile(join(dist, '404.html')); } catch { body = null; }
      const h = headersFor(blocks, url.pathname);
      if (body === null) { res.writeHead(404, { ...h, 'content-type': TYPES['.txt'] }); res.end('Not Found'); }
      else { res.writeHead(404, { ...h, 'content-type': TYPES['.html'] }); res.end(body); }
    }
  });

  try {
    await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
  } catch (err) {
    if (err?.code === 'EADDRINUSE') {
      throw new Error(`${name}: something is already using port ${port}. Stop it, or run with a different port.`);
    }
    throw new Error(`${name}: could not start the server on port ${port} — ${err?.message ?? err}`);
  }

  return { url: `http://localhost:${port}`, close: () => server.close() };
}

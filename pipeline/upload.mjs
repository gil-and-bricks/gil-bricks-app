/**
 * Upload the build output to the gil-bricks-data R2 bucket. Idempotent and
 * resumable: a state file records the md5 of every object successfully
 * uploaded, so re-runs only send new/changed files. manifest.json is always
 * uploaded LAST — the as-of source must never point at data not yet there.
 *
 * Two modes:
 *  - FAST (CI): CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID env vars set →
 *    Cloudflare REST API, concurrent PUTs.
 *  - FALLBACK (local dev): spawns `wrangler r2 object put` per file using the
 *    interactive OAuth session. Slow but needs no extra credentials.
 *
 * Usage: node pipeline/upload.mjs [--dir pipeline/.data/out] [--concurrency 12]
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const BUCKET = 'gil-bricks-data';
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const DIR = flag('--dir', 'pipeline/.data/out');
const CONCURRENCY = Math.max(1, Number(flag('--concurrency', '12')) || 1);
const STATE_PATH = 'pipeline/.data/upload-state.json';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const fastMode = Boolean(TOKEN && ACCOUNT);
// Cloudflare caps the client REST API at 1,200 requests / 5 min account-wide
// — and that limit provably covers wrangler's puts too (a full-speed local
// run 429'd at ~5,000 objects). BOTH modes self-throttle to ~3.3 req/s.
const MIN_GAP_MS = 300;
let nextSlot = 0;
async function throttle() {
  if (MIN_GAP_MS === 0) return;
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
console.log(`mode: ${fastMode ? 'REST API' : 'wrangler fallback'}, concurrency ${CONCURRENCY}`);

const state = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : {};
let stateDirty = 0;
const saveState = () => writeFileSync(STATE_PATH, JSON.stringify(state));

async function listFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile() && e.name.endsWith('.json')) {
      out.push(relative(DIR, join(e.parentPath, e.name)));
    }
  }
  return out;
}

async function putRest(key, body, attempt = 1) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
  await throttle();
  let res;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body,
    });
  } catch (err) {
    // network-level failure — retryable
    if (attempt < 6) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return putRest(key, body, attempt + 1);
    }
    throw err;
  }
  if (res.ok) return;
  const retryable = res.status === 429 || res.status >= 500;
  if (retryable && attempt < 6) {
    const after = Number(res.headers.get("retry-after") ?? 0) * 1000;
    await new Promise((r) => setTimeout(r, Math.max(after, 2000 * attempt)));
    return putRest(key, body, attempt + 1);
  }
  throw new Error(`PUT ${key} failed: HTTP ${res.status} ${await res.text()}`);
}

async function putWrangler(key, path, attempt = 1) {
  await throttle();
  try {
    await exec('node_modules/.bin/wrangler', [
      'r2', 'object', 'put', `${BUCKET}/${key}`,
      '--file', path, '--content-type', 'application/json', '--remote',
    ], { maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    if (attempt < 6) {
      const isRateLimit = String(err.message ?? err).includes("429");
      await new Promise((r) => setTimeout(r, (isRateLimit ? 20000 : 1500) * attempt));
      return putWrangler(key, path, attempt + 1);
    }
    throw err;
  }
}

const all = await listFiles(DIR);
// manifest.json strictly last
const files = all.filter((f) => f !== 'manifest.json').sort();
const hasManifest = all.includes('manifest.json');

let uploaded = 0;
let skipped = 0;
let failed = 0;
const t0 = Date.now();

async function uploadOne(rel) {
  const path = join(DIR, rel);
  const body = readFileSync(path);
  const md5 = createHash('md5').update(body).digest('hex');
  const key = rel.split('\\').join('/');
  if (state[key] === md5) {
    skipped += 1;
    return;
  }
  if (fastMode) await putRest(key, body);
  else await putWrangler(key, path);
  state[key] = md5;
  uploaded += 1;
  stateDirty += 1;
  if (stateDirty >= 50) {
    stateDirty = 0;
    saveState();
  }
  const done = uploaded + skipped;
  if (done % 500 === 0) {
    console.log(`  ${done}/${files.length} (${uploaded} sent, ${skipped} unchanged, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
}

const queue = [...files];
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length > 0) {
    const rel = queue.shift();
    try {
      await uploadOne(rel);
    } catch (err) {
      failed += 1;
      console.error(`FAILED ${rel}: ${err.message ?? err}`);
    }
  }
});
await Promise.all(workers);
saveState();

if (failed > 0) {
  console.error(`${failed} uploads failed — re-run to retry (state file skips completed ones).`);
  process.exit(1);
}

if (hasManifest) {
  console.log('uploading manifest.json (last)...');
  const body = readFileSync(join(DIR, 'manifest.json'));
  if (fastMode) await putRest('manifest.json', body);
  else await putWrangler('manifest.json', join(DIR, 'manifest.json'));
  state['manifest.json'] = createHash('md5').update(body).digest('hex');
  saveState();
}

console.log(`done: ${uploaded} uploaded, ${skipped} unchanged, ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);

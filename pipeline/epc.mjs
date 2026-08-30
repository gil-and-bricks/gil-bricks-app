/**
 * S2.3 EPC stage: stream the domestic full-load CSV zip from
 * api.get-energy-performance-data.communities.gov.uk and slim it to the five
 * columns the join needs. The ~8GB zip is NEVER written to disk and the
 * ~30GB uncompressed CSV never exists anywhere: the HTTP body pipes through
 * `bsdtar -xOf -` and a streaming RFC4180 parser down to pipeline/.data/
 * epc-slim.csv (~2GB).
 *
 * Auth: EPC_BEARER_TOKEN env var; falls back to pipeline/.data/.epc.env
 * (gitignored). The token is never printed or logged.
 *
 * Idempotent: /api/files/domestic/csv/info reports the extract's
 * lastUpdated; if epc-meta.json already records that extract and the slim
 * file exists, the download is skipped.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { Readable } from 'node:stream';

const DATA = 'pipeline/.data';
const SLIM = `${DATA}/epc-slim.csv`;
const META = `${DATA}/epc-meta.json`;
const API = 'https://api.get-energy-performance-data.communities.gov.uk';

// --- token: env first, then .epc.env ---
let token = process.env.EPC_BEARER_TOKEN;
if (!token && existsSync(`${DATA}/.epc.env`)) {
  const m = /^EPC_BEARER_TOKEN=(.+)$/m.exec(readFileSync(`${DATA}/.epc.env`, 'utf8'));
  if (m) token = m[1].trim();
}
if (!token) {
  console.error(
    'EPC_BEARER_TOKEN is not set. Locally: put EPC_BEARER_TOKEN=<token> in pipeline/.data/.epc.env. ' +
    'In CI: run `gh secret set EPC_BEARER_TOKEN --repo gil-and-bricks/gil-bricks-app` with the bearer token from your get-energy-performance-data.communities.gov.uk account page.',
  );
  process.exit(1);
}
const AUTH = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

// --- extract info (also the source of manifest.epcExtractDate) ---
const infoRes = await fetch(`${API}/api/files/domestic/csv/info`, { headers: AUTH });
if (!infoRes.ok) throw new Error(`EPC info endpoint: HTTP ${infoRes.status}`);
const info = (await infoRes.json()).data;
console.log(`EPC extract: ${info.lastUpdated} (${(info.fileSize / 1e9).toFixed(2)} GB zip)`);

if (existsSync(META) && existsSync(SLIM)) {
  const prev = JSON.parse(readFileSync(META, 'utf8'));
  if (prev.lastUpdated === info.lastUpdated) {
    console.log('slim file already matches this extract — skipping download');
    process.exit(0);
  }
}

// --- stream: fetch → bsdtar → RFC4180 parser → slim csv ---
const res = await fetch(`${API}/api/files/domestic/csv`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) throw new Error(`EPC download: HTTP ${res.status}`);

const tar = spawn('bsdtar', ['-xOf', '-', '*.csv'], { stdio: ['pipe', 'pipe', 'inherit'] });
Readable.fromWeb(res.body).pipe(tar.stdin);

const out = createWriteStream(`${SLIM}.tmp`);
out.write('postcode,a1,a2,a3,area,lodgement\n');
const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// Column indexes, re-resolved at every header row (the zip holds many CSVs).
let idx = null;
const HEADER_HINTS = {
  postcode: /^postcode$/i,
  a1: /^address.?(line.?)?1$/i,
  a2: /^address.?(line.?)?2$/i,
  a3: /^address.?(line.?)?3$/i,
  area: /^total.?floor.?area$/i,
  lodgement: /^lodgement.?date(time)?$/i,
};
let rows = 0;
let kept = 0;
let certHeaders = 0;
let otherHeaders = 0;

// A header row is any row carrying a known header token — certificates AND
// recommendations files both qualify (the zip contains both kinds; a raw
// count without this gate hit 100M+ rows of recommendation text).
const HEADER_ROW = /^(lmk.?key|certificate.?number|postcode|improvement.?(item|id)|indicative.?cost)$/i;

function handleRow(row) {
  rows += 1;
  if (row.some((f) => HEADER_ROW.test(f))) {
    const probe = {};
    for (const [k, re] of Object.entries(HEADER_HINTS)) {
      probe[k] = row.findIndex((f) => re.test(f));
    }
    if (Object.values(probe).every((i) => i >= 0)) {
      idx = probe; // a certificates file — process its rows
      certHeaders += 1;
    } else {
      idx = null; // recommendations or other file — skip until next cert header
      otherHeaders += 1;
    }
    return;
  }
  if (!idx) return; // rows of a non-certificate file
  const pc = row[idx.postcode] ?? '';
  if (pc === '') return;
  kept += 1;
  out.write(
    [esc(pc), esc(row[idx.a1] ?? ''), esc(row[idx.a2] ?? ''), esc(row[idx.a3] ?? ''), esc(row[idx.area] ?? ''), esc((row[idx.lodgement] ?? '').slice(0, 10))].join(',') + '\n',
  );
  if (kept % 2_000_000 === 0) console.log(`  ${(kept / 1e6).toFixed(0)}M certificates...`);
}

// Minimal streaming RFC4180 parser (quoted fields may contain commas/newlines).
let field = '';
let row = [];
let inQuotes = false;
let sawQuote = false;
let pendingQuote = false;
const decoder = new TextDecoder('utf-8');
function feed(chunk) {
  const s = decoder.decode(chunk, { stream: true });
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (pendingQuote) {
      // a quote ended the previous chunk inside a quoted field: '"' doubles it,
      // anything else closed the field
      pendingQuote = false;
      if (c === '"') { field += '"'; continue; }
      inQuotes = false;
      // fall through to re-process c as an unquoted character
    }
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 >= s.length) { pendingQuote = true; continue; }
        if (s[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === '' && !sawQuote) {
      inQuotes = true; sawQuote = true;
    } else if (c === ',') {
      row.push(field); field = ''; sawQuote = false;
    } else if (c === '\n') {
      row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
      handleRow(row);
      row = []; field = ''; sawQuote = false;
    } else field += c;
  }
}

const t0 = Date.now();
tar.stdout.on('data', feed);
await new Promise((resolve, reject) => {
  tar.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`bsdtar exited ${code}`))));
  tar.on('error', reject);
});
if (field !== '' || row.length) { row.push(field); handleRow(row); }
await new Promise((r) => out.end(r));
// validate BEFORE committing: a layout change must never leave a bogus
// slim+meta pair behind (a rerun would skip-and-publish all-null areas)
if (certHeaders === 0) throw new Error('no certificates csv found in the zip — layout changed?');
if (certHeaders !== otherHeaders) {
  console.warn(`warning: ${certHeaders} certificate csvs vs ${otherHeaders} other csvs — the zip normally pairs them per local authority; check the layout`);
}
renameSync(`${SLIM}.tmp`, SLIM);
writeFileSync(META, JSON.stringify({ lastUpdated: info.lastUpdated, kept }, null, 2) + '\n');
console.log(`files: ${certHeaders} certificate csvs, ${otherHeaders} other csvs skipped`);
console.log(`done: ${kept} certificates kept of ${rows} rows, ${((Date.now() - t0) / 60000).toFixed(1)} min`);

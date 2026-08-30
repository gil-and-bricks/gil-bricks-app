/**
 * Download the pipeline inputs into pipeline/.data/ (gitignored):
 *  - HM Land Registry Price Paid Data yearly part files covering the last
 *    12 full months. Normally current + previous year; when the current
 *    year's file does not exist yet (LR only creates it with the first
 *    release containing a current-year month, ~late February), the year
 *    before last is fetched instead so the 12-month window stays complete.
 *    HTTPS path-style S3 URL of the official gov.uk-linked hosting.
 *  - The latest ONSPD CSV Collection from the ONS Open Geography portal,
 *    discovered via the portal search API (edition changes quarterly).
 *    Extraction is tied to the discovered edition, and older editions'
 *    CSVs are removed so the build is always deterministic.
 *
 * Skips downloads already present with the right size (safe to re-run).
 */
import { createWriteStream, existsSync, mkdirSync, statSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const DATA = 'pipeline/.data';
mkdirSync(DATA, { recursive: true });

const PPD_BASE = 'https://s3.eu-west-1.amazonaws.com/prod2.publicdata.landregistry.gov.uk';
const GEO_SEARCH =
  'https://geoportal.statistics.gov.uk/api/search/v1/collections/dataset/items?q=ONS%20Postcode%20Directory&limit=100&sortBy=-properties.modified';

/** Returns false (instead of throwing) on 404 when optional=true. */
async function download(url, dest, { optional = false } = {}) {
  const res = await fetch(url, { redirect: 'follow' });
  if (res.status === 404 && optional) {
    console.log(`not published yet (404): ${url}`);
    res.body?.cancel();
    return false;
  }
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (existsSync(dest) && len > 0 && statSync(dest).size === len) {
    console.log(`have ${dest} (${len} bytes) — skipping`);
    res.body?.cancel();
    return true;
  }
  console.log(`downloading ${url} → ${dest}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log(`  done (${statSync(dest).size} bytes)`);
  return true;
}

// --- PPD: current + previous year; fall back to the year before last while
// --- the current-year file does not exist yet (Jan–Feb), so the window
// --- never silently shrinks below 12 full months.
const thisYear = new Date().getUTCFullYear();
const gotCurrent = await download(`${PPD_BASE}/pp-${thisYear}.csv`, `${DATA}/pp-${thisYear}.csv`, { optional: true });
await download(`${PPD_BASE}/pp-${thisYear - 1}.csv`, `${DATA}/pp-${thisYear - 1}.csv`);
if (!gotCurrent) {
  console.log(`pp-${thisYear}.csv not out yet — fetching pp-${thisYear - 2}.csv to keep 12 full months`);
  await download(`${PPD_BASE}/pp-${thisYear - 2}.csv`, `${DATA}/pp-${thisYear - 2}.csv`);
  // A stale current-year file cannot exist in this branch, but a stale
  // year-before-last file CAN linger from a previous January run once the
  // current year publishes; build.mjs's window filter makes extra rows moot.
}

// --- ONSPD: newest "ONS Postcode Directory (<Month Year>)..." CSV Collection.
// Titles vary between editions ("… (May 2026)", "… (February 2026) for the UK"),
// so match the stable prefix and let type + a User-Guide exclusion do the rest.
const search = await (await fetch(GEO_SEARCH, { headers: { Accept: 'application/json' } })).json();
const item = search.features.find(
  (f) =>
    /^ONS Postcode Directory \([A-Z][a-z]+ \d{4}\)/.test(f.properties.title) &&
    !/user guide/i.test(f.properties.title) &&
    f.properties.type === 'CSV Collection',
);
if (!item) throw new Error('Could not find the latest ONSPD CSV Collection on the Open Geography portal');
console.log(`ONSPD: ${item.properties.title} (item ${item.id})`);

const tm = /\(([A-Z][a-z]+) (\d{4})\)/.exec(item.properties.title);
const expectedCsv = `ONSPD_${tm[1].slice(0, 3).toUpperCase()}_${tm[2]}_UK.csv`;

await download(`https://www.arcgis.com/sharing/rest/content/items/${item.id}/data`, `${DATA}/onspd.zip`);

// Extract exactly this edition; clear any other editions so build.mjs can
// never pick up a stale CSV.
mkdirSync(`${DATA}/onspd`, { recursive: true });
if (!existsSync(`${DATA}/onspd/${expectedCsv}`)) {
  for (const f of readdirSync(`${DATA}/onspd`)) {
    if (/^ONSPD.*\.csv$/i.test(f)) rmSync(`${DATA}/onspd/${f}`);
  }
  execFileSync('unzip', ['-o', '-q', '-j', `${DATA}/onspd.zip`, `Data/${expectedCsv}`, '-d', `${DATA}/onspd`]);
}
if (!existsSync(`${DATA}/onspd/${expectedCsv}`)) {
  throw new Error(`Expected ${expectedCsv} inside the ONSPD zip — layout changed?`);
}
console.log('inputs ready:', readdirSync(DATA).join(', '));

/**
 * S3.4 UKHPI stage: fetch the latest UK House Price Index full file
 * (official Land Registry open data), extract the all-property monthly
 * index for England (E92000001) and Wales (W92000004), and write
 * pipeline/.data/ukhpi.json + ukhpi-meta.json. The build stage copies the
 * json into the output as an additive v1 companion and stamps
 * manifest.ukhpiMonth.
 *
 * Idempotent: skips the download when the meta already records the latest
 * published month.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const DATA = 'pipeline/.data';
const BASE = 'https://publicdata.landregistry.gov.uk/market-trend-data/house-price-index-data';

// Newest published month: walk back from the current month (UKHPI lags ~2).
async function findLatestMonth() {
  const now = new Date();
  for (let back = 0; back < 8; back += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const res = await fetch(`${BASE}/UK-HPI-full-file-${m}.csv`, { method: 'HEAD' });
    if (res.ok) return m;
  }
  throw new Error('No UK-HPI full file found in the last 8 months — URL pattern changed?');
}

const month = await findLatestMonth();
console.log(`UKHPI latest published month: ${month}`);

if (existsSync(`${DATA}/ukhpi-meta.json`) && existsSync(`${DATA}/ukhpi.json`)) {
  const prev = JSON.parse(readFileSync(`${DATA}/ukhpi-meta.json`, 'utf8'));
  if (prev.ukhpiMonth === month) {
    console.log('ukhpi.json already matches — skipping download');
    process.exit(0);
  }
}

const res = await fetch(`${BASE}/UK-HPI-full-file-${month}.csv`);
if (!res.ok) throw new Error(`UKHPI download: HTTP ${res.status}`);
const csv = await res.text();

// Columns: Date (DD/MM/YYYY), RegionName, AreaCode, ..., Index, ...
const lines = csv.split('\n');
const header = lines[0].split(',');
const iDate = header.indexOf('Date');
const iArea = header.indexOf('AreaCode');
const iIndex = header.indexOf('Index');
if (iDate < 0 || iArea < 0 || iIndex < 0) {
  throw new Error(`UKHPI header changed — got: ${header.slice(0, 10).join('|')}`);
}

const WANT = new Set(['E92000001', 'W92000004']);
const table = { E92000001: {}, W92000004: {} };
let kept = 0;
for (let i = 1; i < lines.length; i += 1) {
  // country rows carry no quoted commas in the columns we index up to —
  // verified: RegionName for these codes is England/Wales (no commas)
  const cells = lines[i].split(',');
  const area = cells[iArea];
  if (!WANT.has(area)) continue;
  const dm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cells[iDate] ?? '');
  const idx = Number(cells[iIndex]);
  if (!dm || !Number.isFinite(idx) || idx <= 0) continue;
  table[area][`${dm[3]}-${dm[2]}`] = idx;
  kept += 1;
}
const eMonths = Object.keys(table.E92000001).sort();
const wMonths = Object.keys(table.W92000004).sort();
if (eMonths.length < 200 || wMonths.length < 200) {
  throw new Error(`UKHPI extract looks wrong: England ${eMonths.length} months, Wales ${wMonths.length}`);
}
// the published as-of must exist in BOTH tables, or Welsh (or English)
// indexation would break for the newest month
const wSet = new Set(wMonths);
const latestData = [...eMonths].reverse().find((m) => wSet.has(m));
if (!latestData) throw new Error('England and Wales tables share no months — extract broken');

writeFileSync(`${DATA}/ukhpi.json`, JSON.stringify({
  source: 'UK House Price Index, HM Land Registry (Open Government Licence v3.0)',
  ukhpiMonth: latestData,
  index: table,
}));
writeFileSync(`${DATA}/ukhpi-meta.json`, JSON.stringify({ ukhpiMonth: month, latestDataMonth: latestData, rows: kept }, null, 2) + '\n');
console.log(`done: ${kept} rows kept; England ${eMonths[0]}..${latestData}, Wales ${wMonths[0]}..${wMonths[wMonths.length - 1]}`);

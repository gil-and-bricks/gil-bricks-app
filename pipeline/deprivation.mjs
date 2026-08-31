/**
 * S5.1 deprivation stage: official deprivation indices → one normalised
 * lookup at pipeline/.data/deprivation.json:
 *   { imdEdition, wimdEdition, sources, england: {lsoa21cd: decile},
 *     wales: {lsoa21cd: {rank, decile}} }
 *
 * England — English Indices of Deprivation 2025 (MHCLG, published
 *   30 Oct 2025, files updated 17 Nov 2025), File 7 CSV, LSOA 2021.
 * Wales — Welsh Index of Multiple Deprivation 2025 (Welsh Government,
 *   published 27 Nov 2025), index ranks ODS, LSOA 2021. Official rank AND
 *   decile columns are published; nothing is derived here.
 *
 * The two indices rank England-only and Wales-only respectively and are
 * NEVER blended or compared to each other.
 * Idempotent: existing downloads of the right size are kept.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DATA = 'pipeline/.data';
const IMD_CSV = `${DATA}/imd2025-file7.csv`;
const WIMD_ODS = `${DATA}/wimd2025-ranks.ods`;
const OUT = `${DATA}/deprivation.json`;

const IMD_URL =
  'https://assets.publishing.service.gov.uk/media/691ded56d140bbbaa59a2a7d/File_7_IoD2025_All_Ranks_Scores_Deciles_Population_Denominators.csv';
const WIMD_URL =
  'https://www.gov.wales/sites/default/files/statistics-and-research/2025-11/wimd-2025-index-and-domain-ranks-by-small-area.ods';

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (existsSync(dest) && len > 0 && statSync(dest).size === len) {
    console.log(`have ${dest} (${len} bytes) — skipping`);
    res.body?.cancel();
    return;
  }
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`downloaded ${dest} (${statSync(dest).size} bytes)`);
}

await download(IMD_URL, IMD_CSV);
await download(WIMD_URL, WIMD_ODS);

// --- England: File 7 CSV. Minimal RFC4180 parse (LA names may hold commas). ---
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else inQ = false;
      } else field += c;
    } else if (c === '"' && field === '') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') {
      row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const imdRows = parseCsv(readFileSync(IMD_CSV, 'utf8'));
const imdHeader = imdRows[0];
const lsoaCol = imdHeader.findIndex((h) => /^LSOA code \(2021\)$/i.test(h));
const decCol = imdHeader.findIndex((h) => /^Index of Multiple Deprivation \(IMD\) Decile/i.test(h));
if (lsoaCol < 0 || decCol < 0) throw new Error(`IMD File 7 header changed: ${imdHeader.slice(0, 8).join(' | ')}`);
const england = {};
for (const r of imdRows.slice(1)) {
  const code = r[lsoaCol];
  const dec = Number(r[decCol]);
  if (!/^E\d{8}$/.test(code) || !(dec >= 1 && dec <= 10)) continue;
  england[code] = dec;
}
console.log(`IMD 2025 (England): ${Object.keys(england).length} LSOAs`);
if (Object.keys(england).length < 30000) throw new Error('IMD parse looks wrong (<30k LSOAs)');

// --- Wales: ODS is a zip; extract content.xml with bsdtar, pull the
// LSOA_overall_rank_decile_quintile_quartile sheet. ---
const xml = execFileSync('bsdtar', ['-xOf', WIMD_ODS, 'content.xml'], {
  maxBuffer: 64 * 1024 * 1024,
}).toString('utf8');

const cellsOf = (rowXml) => {
  const out = [];
  const re = /<table:table-cell([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g;
  let m;
  while ((m = re.exec(rowXml)) !== null) {
    const attrs = m[1] ?? '';
    const valueAttr = /office:value="([^"]*)"/.exec(attrs);
    const text = (m[2] ?? '').replace(/<[^>]+>/g, '');
    const rep = /table:number-columns-repeated="(\d+)"/.exec(attrs);
    const n = rep ? Number(rep[1]) : 1;
    for (let i = 0; i < n; i += 1) out.push(valueAttr ? valueAttr[1] : text);
  }
  return out;
};

// Sheet selection by CONTENT, not name: walk every <table:table> and use the
// one whose header row carries 'LSOA code' + the WIMD overall rank/decile
// columns (sheet names and ordering have no stability guarantee in the ODS).
const wales = {};
let sheetsMatched = 0;
for (const tableXml of xml.match(/<table:table[\s>][\s\S]*?<\/table:table>/g) ?? []) {
  let rankCol = -1;
  let wDecCol = -1;
  let header = null;
  const rows = tableXml.match(/<table:table-row[^>]*>[\s\S]*?<\/table:table-row>/g) ?? [];
  for (const rowXml of rows) {
    const cells = cellsOf(rowXml);
    if (!header && cells[0] === 'LSOA code') {
      rankCol = cells.findIndex((c) => /^WIMD 2025 overall rank$/i.test(c));
      wDecCol = cells.findIndex((c) => /^WIMD 2025 overall decile$/i.test(c));
      if (rankCol < 0 || wDecCol < 0) break; // a different LSOA table — skip it
      header = cells;
      continue;
    }
    if (!header || !/^W\d{8}$/.test(cells[0] ?? '')) continue;
    const rank = Number(cells[rankCol]);
    const decile = Number(cells[wDecCol]);
    if (!(rank >= 1) || !(decile >= 1 && decile <= 10)) continue;
    wales[cells[0]] = { rank, decile };
  }
  if (header) sheetsMatched += 1;
}
if (sheetsMatched !== 1) {
  throw new Error(`WIMD ODS: expected exactly 1 sheet with LSOA code + overall rank/decile headers, matched ${sheetsMatched} — layout changed?`);
}
console.log(`WIMD 2025 (Wales): ${Object.keys(wales).length} LSOAs`);
if (Object.keys(wales).length !== 1917) {
  throw new Error(`WIMD parse expected 1917 LSOAs, got ${Object.keys(wales).length}`);
}

writeFileSync(
  OUT,
  JSON.stringify({
    imdEdition: 'English Indices of Deprivation 2025',
    wimdEdition: 'Welsh Index of Multiple Deprivation 2025',
    sources: { england: IMD_URL, wales: WIMD_URL },
    england,
    wales,
  }),
);
console.log(`wrote ${OUT}`);

/**
 * S2.2 build: PPD + ONSPD → per-sector schema-v1 JSON files + manifest.json.
 *
 * DuckDB does the heavy lifting (CSV parsing, filtering, the postcode join,
 * ordering) so the multi-GB source CSVs are never held in JS memory; the
 * filtered 12-month result (~600k compact rows, a few hundred MB peak) is
 * materialised once, then written out one sector file per group.
 *
 * Usage: node pipeline/build.mjs [--country W92000004] [--out pipeline/.data/out]
 */
import { DuckDBInstance } from '@duckdb/node-api';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sectorStats } from './stats.mjs';

const DATA = 'pipeline/.data';
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const countryFilter = flag('--country'); // e.g. W92000004 for the Wales smoke slice
const OUT = flag('--out') ?? `${DATA}/out`;

const onspdCsv = readdirSync(`${DATA}/onspd`).find((f) => /^ONSPD.*\.csv$/i.test(f));
if (!onspdCsv) throw new Error('ONSPD csv not found under pipeline/.data/onspd');
// Edition from the filename, e.g. ONSPD_MAY_2026_UK.csv → 2026-05
const em = /ONSPD_([A-Z]{3})_(\d{4})/i.exec(onspdCsv);
const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const onspdEdition = em ? `${em[2]}-${MONTHS[em[1].toUpperCase()]}` : '';
if (!onspdEdition) throw new Error(`Cannot derive ONSPD edition from ${onspdCsv}`);

const t0 = Date.now();
const instance = await DuckDBInstance.create(':memory:');
const db = await instance.connect();

// PPD yearly files have no header. Column order per HM Land Registry spec.
await db.run(`
  CREATE VIEW ppd AS
  SELECT * FROM read_csv('${DATA}/pp-*.csv', header=false, columns={
    'id':'VARCHAR','price':'BIGINT','date':'VARCHAR','postcode':'VARCHAR',
    'type':'VARCHAR','new_build':'VARCHAR','tenure':'VARCHAR',
    'paon':'VARCHAR','saon':'VARCHAR','street':'VARCHAR','locality':'VARCHAR',
    'town':'VARCHAR','district':'VARCHAR','county':'VARCHAR',
    'category':'VARCHAR','record_status':'VARCHAR'
  })
`);

// Window: 12 full months ending at the newest month in the data.
const maxRow = await db.runAndReadAll(`SELECT max(substr(date,1,7)) AS m FROM ppd`);
const ppdMonth = maxRow.getRows()[0][0];
const [my, mm] = ppdMonth.split('-').map(Number);
const start = `${mm === 12 ? my : my - 1}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}-01`;
console.log(`ppdMonth=${ppdMonth} window >= ${start}, onspdEdition=${onspdEdition}`);

await db.run(`
  CREATE VIEW onspd AS
  SELECT upper(trim(pcds)) AS pcds, lat, long AS lng, ctry25cd AS ctry
  FROM read_csv('${DATA}/onspd/${onspdCsv}', header=true, all_varchar=false)
`);

const countrySql = countryFilter
  ? `AND o.ctry = '${countryFilter}'`
  : `AND o.ctry IN ('E92000001','W92000004')`;

// Category A only; duplicate transaction ids deduped deterministically
// (yearly files are already resolved — this is belt-and-braces).
const sql = `
  WITH clean AS (
    SELECT DISTINCT ON (p.id)
      p.id, substr(p.date,1,10) AS date, p.price,
      coalesce(p.paon,'') AS paon, coalesce(p.saon,'') AS saon,
      coalesce(p.street,'') AS street, coalesce(p.town,'') AS town,
      upper(trim(p.postcode)) AS postcode,
      p.type, p.tenure, p.new_build,
      o.lat, o.lng, o.ctry
    FROM ppd p
    JOIN onspd o ON upper(trim(p.postcode)) = o.pcds
    WHERE p.category = 'A'
      AND p.date >= '${start}'
      AND p.postcode IS NOT NULL
      AND p.tenure IN ('F','L')
      AND p.type IN ('D','S','T','F','O')
      AND o.lat IS NOT NULL AND o.lat < 90
      ${countrySql}
    ORDER BY p.id, p.record_status DESC
  )
  SELECT *,
    regexp_extract(postcode, '^(\\S+) (\\d)', 1) || ' ' || regexp_extract(postcode, '^(\\S+) (\\d)', 2) AS sector
  FROM clean
  WHERE regexp_extract(postcode, '^(\\S+) (\\d)', 1) <> ''
  ORDER BY sector, date, id
`;

const reader = await db.runAndReadAll(sql);
const rows = reader.getRowObjects();
console.log(`rows after filter+join: ${rows.length}`);

mkdirSync(OUT, { recursive: true });
let sectorsWritten = 0;
let totalSales = 0;
let current = null;
let bucket = [];

const flush = () => {
  if (!current || bucket.length === 0) return;
  const [outcode, digit] = current.split(' ');
  const dir = join(OUT, 'sectors', outcode);
  mkdirSync(dir, { recursive: true });
  // Border-straddling sectors exist (SY/LD/HR/NP/CH): the file takes the
  // majority country of the window sales (ties: first alphabetically = England).
  const tally = {};
  for (const r of bucket) tally[r.ctry] = (tally[r.ctry] ?? 0) + 1;
  const country = Object.entries(tally).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  const file = {
    schemaVersion: 1,
    sector: current,
    country,
    updatedAt: new Date().toISOString(),
    sales: bucket.map((r) => ({
      id: r.id,
      date: r.date,
      price: Number(r.price),
      paon: r.paon,
      saon: r.saon,
      street: r.street,
      town: r.town,
      postcode: r.postcode,
      type: r.type,
      tenure: r.tenure,
      newBuild: r.new_build === 'Y',
      lat: Number(r.lat),
      lng: Number(r.lng),
      floorAreaSqm: null,
      ppsqm: null,
    })),
    stats: null,
  };
  file.stats = sectorStats(file.sales);
  writeFileSync(join(dir, `${outcode}-${digit}.json`), JSON.stringify(file));
  sectorsWritten += 1;
  totalSales += bucket.length;
  bucket = [];
};

for (const r of rows) {
  if (r.sector !== current) {
    flush();
    current = r.sector;
  }
  bucket.push(r);
}
flush();

const manifest = {
  schemaVersion: 1,
  ppdMonth,
  ukhpiMonth: '',
  epcExtractDate: '',
  onspdEdition,
  generatedAt: new Date().toISOString(),
  sectorsCount: sectorsWritten,
};
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`sectors written: ${sectorsWritten}`);
console.log(`total sales: ${totalSales}`);
console.log(`build seconds: ${((Date.now() - t0) / 1000).toFixed(1)}`);

/**
 * CA1 — WHICH LOCAL AUTHORITY A POSTCODE SECTOR SITS IN.
 *
 * The trajectory panel needs one thing the published data did not carry: the
 * official area codes for the place a deal is in. UK HPI publishes its index by
 * local authority, so without this the panel has a series and no way to know
 * which series belongs to the postcode on screen.
 *
 * WHY A SEPARATE FILE rather than a field on every sector. The sector files are
 * the product's largest output by far, and adding a field to them means
 * regenerating and re-uploading the whole set — hours of pipeline and a lot of
 * Class A operations — to carry twenty bytes. This is one small companion,
 * generated from the ONSPD extract the pipeline already downloads, fetched only
 * when somebody opens the panel.
 *
 * INTERNED, because the shape is one code repeated thousands of times. There
 * are about 350 local authorities and 10 regions against roughly 10,000
 * sectors, so the codes are listed once and the sectors hold indices into that
 * list. It is the difference between a file measured in hundreds of kilobytes
 * and one measured in tens.
 *
 * A SECTOR CAN STRADDLE A BOUNDARY, and this takes the majority of its live
 * postcodes — the same rule, and the same tie-break, the sector files already
 * use for country. A sector genuinely split down the middle is rare, and the
 * panel is about the wider area either way.
 *
 * ATTRIBUTION. Contains OS data © Crown copyright and database right 2026;
 * Contains Royal Mail data © Royal Mail copyright and database right 2026;
 * Source: Office for National Statistics licensed under the Open Government
 * Licence v3.0.
 */
import { createReadStream, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { csvHeader, onspdColumn } from './onspd-columns.mjs';

const DATA = 'pipeline/.data';

/** The ONSPD CSV the download stage leaves behind. */
export function findOnspd(dir = `${DATA}/onspd`) {
  if (!existsSync(dir)) throw new Error(`No ONSPD extract at ${dir} — run \`node pipeline/download.mjs\` first`);
  const csv = readdirSync(dir).find((f) => /^ONSPD_.*\.csv$/i.test(f));
  if (!csv) throw new Error(`No ONSPD_*.csv in ${dir}`);
  return join(dir, csv);
}

/** ONSPD wraps every field in quotes. Strip them before anything else. */
export const unquote = (cell) => String(cell ?? '').trim().replace(/^"(.*)"$/s, '$1').trim();

/** "CF37 1DL" -> "CF37 1". Anything that is not a UK postcode returns null. */
export function sectorOf(pcds) {
  const m = /^([A-Z]{1,2}\d[A-Z\d]?)\s+(\d)[A-Z]{2}$/.exec(String(pcds).toUpperCase().trim());
  return m ? `${m[1]} ${m[2]}` : null;
}

/**
 * Read ONSPD once and return the majority local authority and region for every
 * England-and-Wales sector with live postcodes.
 */
export async function buildAreaCodes(csvPath) {
  const input = createReadStream(csvPath, { encoding: 'utf8' });
  const rl = createInterface({ input, crlfDelay: Infinity });

  let cols = null;
  /** sector -> Map<'lad|rgn', Map<code, count>> */
  const tally = new Map();
  let rows = 0;

  for await (const line of rl) {
    if (cols === null) {
      const header = csvHeader(line);
      cols = {
        pcds: header.indexOf('pcds'),
        doterm: header.indexOf('doterm'),
        ctry: header.indexOf(onspdColumn(header, 'ctry')),
        lad: header.indexOf(onspdColumn(header, 'lad')),
        rgn: header.indexOf(onspdColumn(header, 'rgn')),
      };
      for (const [name, i] of Object.entries(cols)) {
        if (i < 0) throw new Error(`ONSPD has no ${name} column — cannot map a postcode to its local authority`);
      }
      continue;
    }
    // ONSPD quotes every field, so a LIVE postcode's `doterm` is the two
    // characters `""` rather than an empty string. Comparing the raw cell to ''
    // silently skipped every row in the file.
    const c = line.split(',').map(unquote);
    // A terminated postcode is not somewhere anybody lives now.
    if (c[cols.doterm] !== '') continue;
    const ctry = c[cols.ctry];
    if (ctry !== 'E92000001' && ctry !== 'W92000004') continue;
    const sector = sectorOf(c[cols.pcds]);
    if (sector === null) continue;
    const lad = c[cols.lad] ?? '';
    const rgn = c[cols.rgn] ?? '';
    let t = tally.get(sector);
    if (!t) { t = { lad: new Map(), rgn: new Map(), ctry: new Map() }; tally.set(sector, t); }
    if (lad !== '') t.lad.set(lad, (t.lad.get(lad) ?? 0) + 1);
    if (rgn !== '') t.rgn.set(rgn, (t.rgn.get(rgn) ?? 0) + 1);
    t.ctry.set(ctry, (t.ctry.get(ctry) ?? 0) + 1);
    rows += 1;
  }

  if (rows < 1_000_000) throw new Error(`ONSPD gave only ${rows} live England/Wales postcodes — extract looks wrong`);

  /** Most common, ties broken alphabetically — the sector files' own rule. */
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;

  const codes = [];
  const indexOfCode = new Map();
  const intern = (code) => {
    if (code === null) return -1;
    let i = indexOfCode.get(code);
    if (i === undefined) { i = codes.length; codes.push(code); indexOfCode.set(code, i); }
    return i;
  };

  const sectors = {};
  for (const [sector, t] of [...tally.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    sectors[sector] = [intern(top(t.lad)), intern(top(t.rgn)), intern(top(t.ctry))];
  }

  return { codes, sectors, count: Object.keys(sectors).length };
}

/** Write the published companion. */
export async function writeAreaCodes(outPath, csvPath) {
  const { codes, sectors, count } = await buildAreaCodes(csvPath);
  writeFileSync(outPath, JSON.stringify({
    schemaVersion: 1,
    source: 'ONS Postcode Directory, Office for National Statistics',
    licence: 'Open Government Licence v3.0',
    codes,
    sectors,
  }));
  console.log(`area-codes: ${count} sectors, ${codes.length} distinct area codes`);
  return { count, codes: codes.length };
}

// Run directly: `node pipeline/area-codes.mjs [outPath]`
if (import.meta.url === `file://${process.argv[1]}`) {
  await writeAreaCodes(process.argv[2] ?? `${DATA}/area-codes.json`, findOnspd());
}

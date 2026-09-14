/**
 * CA1 — THE AREA'S OWN HISTORY, at local authority level.
 *
 * WHAT THIS PRODUCES AND WHY IT IS SEPARATE. `ukhpi.mjs` already downloads the
 * UK House Price Index full file once a month for the valuation's indexation,
 * and it keeps only the England and Wales rows. That same 35MB file carries
 * every local authority and every region, with an index, an average price and a
 * monthly sales volume. This module rides that one download and writes a second,
 * additive output — so the existing `ukhpi.json` the valuation depends on is
 * untouched, and deleting this file and its two call sites removes the feature
 * whole.
 *
 * WHY LOCAL AUTHORITY. It is the smallest geography for which an official
 * house price index is published. Anything finer would mean computing a trend
 * from a handful of sales and calling it one, which is the thing this panel
 * exists to avoid.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It computes no growth, no average, no
 * scenario and no projection. It publishes the index values and lets
 * @gil-bricks/core do the arithmetic, because every number in this product is
 * computed in one place and this file is a data stage, not a maths engine.
 *
 * ATTRIBUTION. Contains HM Land Registry data © Crown copyright and database
 * right 2026. This data is licensed under the Open Government Licence v3.0.
 */
import { writeFileSync } from 'node:fs';

/** How many same-month observations to publish: 21 gives 20 annual changes. */
export const YEARS = 21;

/**
 * The geographies worth publishing.
 *  E06 unitary authority · E07 non-metropolitan district · E08 metropolitan
 *  borough · E09 London borough · W06 Welsh unitary authority — these are the
 *  local authorities, and are what a postcode's `lad` column resolves to.
 *  E12 is a region; E92000001 / W92000004 are England and Wales.
 */
const LA = /^(E0[6789]|W06)\d{6}$/;
const REGION = /^E12\d{6}$/;
const COUNTRY = new Set(['E92000001', 'W92000004']);

const kindOf = (code) => {
  if (COUNTRY.has(code)) return 'country';
  if (REGION.test(code)) return 'region';
  return LA.test(code) ? 'la' : null;
};

/**
 * A CSV row, respecting quotes. Several local authorities carry a comma in
 * their own name — "Bristol, City of", "Herefordshire, County of" — so a plain
 * split would shift every column after the name and silently attribute one
 * area's prices to another.
 */
export function splitCsv(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const num = (s) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * Build the published table from the UK HPI full file's lines.
 *
 * Returns { month, areas } where `month` is the newest month the INDEX is
 * published for, and each area carries the index at that same month in each of
 * the last YEARS years — same month each year, so a year-on-year change is a
 * like-for-like comparison rather than a December-to-June one.
 */
export function buildTrajectory(lines) {
  const header = splitCsv(lines[0]);
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`UK HPI header has no "${name}" column — got ${header.slice(0, 12).join('|')}`);
    return i;
  };
  const iDate = col('Date');
  const iName = col('RegionName');
  const iArea = col('AreaCode');
  const iPrice = col('AveragePrice');
  const iIndex = col('Index');
  const iVolume = col('SalesVolume');

  /** code -> { name, kind, months: Map<'YYYY-MM', {i, p, v}> } */
  const seen = new Map();
  for (let r = 1; r < lines.length; r += 1) {
    const line = lines[r];
    if (line === '') continue;
    const cells = splitCsv(line);
    const code = cells[iArea];
    const kind = kindOf(code);
    if (kind === null) continue;
    const dm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cells[iDate] ?? '');
    if (!dm) continue;
    const idx = num(cells[iIndex]);
    if (idx === null || idx <= 0) continue;
    let area = seen.get(code);
    if (!area) { area = { name: cells[iName] ?? code, kind, months: new Map() }; seen.set(code, area); }
    area.months.set(`${dm[3]}-${dm[2]}`, { i: idx, p: num(cells[iPrice]), v: num(cells[iVolume]) });
  }

  if (seen.size < 300) throw new Error(`UK HPI gave only ${seen.size} areas — expected 350+ (local authorities missing?)`);

  /**
   * The newest month EVERY published area has an index for. Taking each area's
   * own latest would compare one area's June with another's April and call the
   * difference growth.
   */
  const common = [...seen.values()]
    .map((a) => new Set(a.months.keys()))
    .reduce((acc, s) => new Set([...acc].filter((m) => s.has(m))));
  const month = [...common].sort().at(-1);
  if (!month) throw new Error('UK HPI areas share no month — extract broken');
  const [latestYear, mm] = month.split('-');

  const areas = {};
  for (const [code, a] of seen) {
    const series = [];
    for (let back = YEARS - 1; back >= 0; back -= 1) {
      const key = `${Number(latestYear) - back}-${mm}`;
      const cell = a.months.get(key);
      // A run of consecutive years, most recent last. A gap truncates rather
      // than interpolating: an invented value would become invented growth.
      series.push(cell ? Math.round(cell.i * 10) / 10 : null);
    }
    const firstGap = series.lastIndexOf(null);
    const usable = firstGap === -1 ? series : series.slice(firstGap + 1);
    if (usable.length < 6) continue; // fewer than five annual changes says nothing

    /**
     * TRAILING-YEAR SALES, and how the panel's thirty-sale floor is judged.
     *
     * The index is published sooner than the volume: in the 2026-06 file,
     * England's last two months carry no volume at all, and the three before
     * them read 36k, 45k, 45k against a settled monthly run-rate near 65k —
     * they are still being registered. Two consequences, both handled here
     * rather than hidden:
     *
     *  1. Summing "the last twelve months" blindly would count the blank months
     *     as zero and make every area look thin. So this sums the twelve most
     *     recent months that actually HAVE a volume.
     *  2. Those months are still INCOMPLETE, so the total understates. That is
     *     the safe direction for a floor whose job is to suppress thin data: it
     *     may occasionally withhold a figure that would have been fine, and can
     *     never show one that should have been withheld. `vTo` publishes the
     *     month the window ends at so the panel can say which year it means,
     *     and the copy says "registered" rather than "sold".
     */
    const withVolume = [...a.months.entries()]
      .filter(([, c]) => typeof c.v === 'number' && c.v >= 0)
      .sort((x, y) => (x[0] < y[0] ? -1 : 1));
    const window = withVolume.slice(-12);
    const volume = window.length === 12
      ? window.reduce((sum, [, c]) => sum + c.v, 0)
      : null;

    areas[code] = {
      n: a.name,
      k: a.kind,
      p: a.months.get(month)?.p ?? null,
      v: volume,
      vTo: window.length === 12 ? window[11][0] : null,
      i: usable,
    };
  }

  return { month, areas };
}

/**
 * AFFORDABILITY — house price to earnings, from ONS.
 *
 * WHICH MEASURE, AND WHY IT IS SAID ON SCREEN. ONS publishes two ratios. The
 * WORKPLACE-based one is the measure most often quoted, and it exists in one
 * form only: a single XLSX, updated once a year. The RESIDENCE-based one is
 * published as a keyless CSV at local authority, region and country level, and
 * is what this uses.
 *
 * They are genuinely different numbers for the same place — Hartlepool is 4.74
 * workplace-based against 4.86 residence-based — so the panel names the measure
 * it is showing rather than letting a reader assume the other one. Quietly
 * swapping one for the other to get a convenient file would be shipping a
 * number nobody sanctioned, wearing the name of one they did.
 *
 * Source: Office for National Statistics, Open Government Licence v3.0.
 */
const AFFORDABILITY = 'https://www.ons.gov.uk/explore-local-statistics/api/v1/data.csv'
  + '?indicator=housing-affordability-ratio&geo=';

export async function fetchAffordability(fetchImpl = fetch) {
  const out = {};
  let period = null;
  for (const geo of ['ltla', 'rgn', 'ctry']) {
    const res = await fetchImpl(`${AFFORDABILITY}${geo}`);
    if (!res.ok) throw new Error(`ONS affordability (${geo}): HTTP ${res.status}`);
    const rows = (await res.text()).split('\n').slice(1);
    for (const row of rows) {
      const [code, , when, value] = splitCsv(row.trim());
      const v = num(value);
      if (!code || v === null) continue;
      // Newest period wins: the endpoint serves every year at once.
      const prev = out[code];
      if (prev === undefined || when > prev.when) out[code] = { when, v };
      if (period === null || (when && when > period)) period = when;
    }
  }
  const ratios = {};
  for (const [code, { v }] of Object.entries(out)) ratios[code] = v;
  return { ratios, period };
}

/** Write the published companion. */
export async function writeTrajectory(dataDir, lines, fetchImpl = fetch) {
  const { month, areas } = buildTrajectory(lines);

  // Affordability is a separate official source, so a failure there must not
  // take the whole stage down — the panel simply shows no ratio and says so.
  let affordability = { ratios: {}, period: null };
  try {
    affordability = await fetchAffordability(fetchImpl);
  } catch (e) {
    console.warn(`area-trajectory: affordability unavailable (${e.message}) — publishing without it`);
  }
  let withRatio = 0;
  for (const [code, a] of Object.entries(areas)) {
    const r = affordability.ratios[code];
    if (typeof r === 'number') { a.a = r; withRatio += 1; }
  }
  console.log(`area-trajectory: affordability for ${withRatio} areas (period ${affordability.period ?? 'none'})`);
  const out = {
    schemaVersion: 1,
    source: 'UK House Price Index, HM Land Registry',
    licence: 'Open Government Licence v3.0',
    month,
    years: YEARS,
    /** Which ONS ratio the `a` values are, said in the data itself. */
    affordability: { measure: 'residence', period: affordability.period },
    areas,
  };
  writeFileSync(`${dataDir}/area-trajectory.json`, JSON.stringify(out));
  const kinds = Object.values(areas).reduce((t, a) => ({ ...t, [a.k]: (t[a.k] ?? 0) + 1 }), {});
  console.log(`area-trajectory: month ${month}, ${Object.keys(areas).length} areas `
    + `(${kinds.la ?? 0} local authorities, ${kinds.region ?? 0} regions, ${kinds.country ?? 0} countries)`);
  return { month, count: Object.keys(areas).length };
}

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ANALYSER_SECTIONS, SECTION_STRIP } from './analyserSections';
import { COMPARABLES } from './comparables';
import { MAP_COPY } from './misc';

/**
 * The comparables overhaul (C1), pinned.
 *
 * Every one of these came from the operator using the analyser properly for the
 * first time, so each is a decision rather than a preference: the evidence goes
 * before the valuation built on it, it is open where people will see it, and it
 * is measured in the unit the rest of the product uses.
 */
const src = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string): string => readFileSync(join(src, p), 'utf8');

describe('comparables come BEFORE valuation', () => {
  it('in the section chip strip', () => {
    const ids = ANALYSER_SECTIONS.map((s) => s.id);
    expect(ids.indexOf('sec-comps'), 'comps before valuation').toBeLessThan(ids.indexOf('valuation'));
    expect(ids.at(-1), 'valuation goes last').toBe('valuation');
  });

  it('and on the page itself, which the strip is a map of', () => {
    const shell = read('components/analyser/AnalyserApp.tsx');
    expect(shell.indexOf('<CompsModule'), 'the page order must match the strip')
      .toBeLessThan(shell.indexOf('<ValuationCard'));
  });
});

describe('comparables are open by default', () => {
  it('the disclosure is seeded open, and stays a disclosure so it can be closed', () => {
    const mod = read('components/analyser/CompsModule.tsx');
    expect(mod).toContain('useRef(true)');
    expect(mod, 'still closable').toContain('<details class="comps-fold"');
  });

  it('the line on it no longer invites you to open what is already open', () => {
    const line = SECTION_STRIP.compsSummary(20, '£245/m²');
    expect(line).not.toMatch(/tap to explore|open to explore/i);
    expect(line).toBe('20 comparable sales · typical £245/m²');
  });
});

describe('metric units, everywhere', () => {
  it('nothing in the product’s user-facing config says sqft', () => {
    const dirs = ['config', 'content', 'components', 'pages', 'lib'];
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const f of readdirSync(join(src, dir), { recursive: true, encoding: 'utf8' })) {
        if (!/\.(ts|tsx|astro)$/.test(f) || f.endsWith('.test.ts') || f.endsWith('.test.tsx')) continue;
        // COMMENTS STRIPPED FIRST. The files that explain why the unit changed
        // must be free to say the old word; only what a person can READ counts.
        const body = readFileSync(join(src, dir, f), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        if (/sqft|sq ft|square foot|square feet/i.test(body)) offenders.push(`${dir}/${f}`);
      }
    }
    expect(offenders, 'the product works in m²').toEqual([]);
  });

  it('the comparables copy prints m², not feet', () => {
    expect(COMPARABLES.card.perSqmValue(245)).toBe('£245/m²');
    expect(COMPARABLES.card.perSqmValue(1770), 'four digits stay readable').toBe('£1,770/m²');
    expect(COMPARABLES.card.sqmValue(74)).toBe('74 m²');
    expect(COMPARABLES.table.perSqm).toBe('£/m²');
    expect(COMPARABLES.table.sqm).toBe('m²');
  });
});

describe('the row shows the right things', () => {
  it('the age column is gone — every row said "Existing"', () => {
    expect(Object.keys(COMPARABLES.table)).not.toContain('age');
    const mod = read('components/analyser/CompsModule.tsx');
    expect(mod).not.toContain('COMPARABLES.table.age');
    expect(mod, 'and it is off the phone card too').not.toContain('<span>{AGE_LABEL(c)}</span>');
  });

  it('but the age FILTER stays — new builds still matter when you filter', () => {
    expect(COMPARABLES.filters.age.newBuild).toBeTruthy();
  });

  it('the actions are a COLUMN of their own, straight after the address (C3)', () => {
    // C1 put them inside the address cell. The table sets nowrap, so they sat
    // BESIDE each address rather than under it, and their left edge tracked the
    // length of the address — a 146px wander down the list at 1280px. See
    // compsRowAndMap.test.ts for the rule this replaced it with.
    const mod = read('components/analyser/CompsModule.tsx');
    expect(mod, 'the columns have headings again').toContain('COMPARABLES.table.thisProperty');
    const at = mod.indexOf('<td class="comp-address-cell">');
    const cell = mod.slice(at, mod.indexOf('</td>', at));
    expect(cell, 'the address cell carries the address and nothing else').not.toContain('<CompActions');
  });

  it('the columns the operator asked to keep are all still there', () => {
    for (const k of ['include', 'date', 'address', 'postcode', 'propertyType', 'tenure', 'price']) {
      expect(COMPARABLES.table, k).toHaveProperty(k);
    }
  });
});

describe('the per-sale page is gone, with nothing left pointing at it', () => {
  it('no source file links to /transaction', () => {
    const offenders: string[] = [];
    for (const dir of ['config', 'content', 'components', 'pages', 'lib', 'layouts']) {
      for (const f of readdirSync(join(src, dir), { recursive: true, encoding: 'utf8' })) {
        if (!/\.(ts|tsx|astro)$/.test(f) || /\.test\./.test(f)) continue;
        if (/href=["'`][^"'`]*\/transaction/.test(readFileSync(join(src, dir, f), 'utf8'))) {
          offenders.push(`${dir}/${f}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('every action label promises exactly what it delivers', () => {
  it('the portal buttons say SOLD PRICES for the postcode, not "the listing"', () => {
    const A = COMPARABLES.actions;
    expect(A.rightmoveFull('SA1 6SN')).toBe('Sold prices for SA1 6SN on Rightmove');
    expect(A.zooplaFull('SA1 6SN')).toBe('Sold prices for SA1 6SN on Zoopla');
    for (const said of [A.rightmoveFull('X'), A.zooplaFull('X'), A.portalNote]) {
      expect(said.toLowerCase(), 'never promises the exact listing').not.toMatch(/this (property|listing|house)/);
    }
  });

  it('Google says it searches, and Land Registry says it is the record', () => {
    expect(COMPARABLES.actions.googleFull('9 Llewellyn Circle SA1 6SN'))
      .toBe('Search Google for 9 Llewellyn Circle SA1 6SN');
    expect(COMPARABLES.actions.landRegistryFull('9 Llewellyn Circle')).toContain('Land Registry record');
  });

  it('every action opens in a new tab, so the deal in progress survives', () => {
    const mod = read('components/analyser/CompsModule.tsx');
    const actions = mod.slice(mod.indexOf('function CompActions'), mod.indexOf('export function CompsModule'));
    expect(actions.match(/target="_blank"/g) ?? []).toHaveLength(4);
    expect(actions.match(/rel="noopener"/g) ?? []).toHaveLength(4);
  });
});

describe('the map popup survives a sale with no floor area', () => {
  /**
   * MapLibre DROPS null-valued properties when it serialises a geojson source,
   * so a comp with no EPC floor area arrives with the key ABSENT — undefined,
   * not null. A `!== null` guard passed, and the formatting call behind it then
   * threw, so the popup was never built and about one pin in ten was simply
   * dead. `!= null` catches both, and the value is escaped as well as formatted.
   */
  const map = read('components/analyser/mapImpl.ts');

  it('guards with != null, which catches undefined as well as null', () => {
    expect(map).toContain('p.persqm != null');
    expect(map, 'a !== null guard is the bug').not.toContain('p.persqm !== null');
  });

  it('the formatted figure still goes through the escaper', () => {
    const line = map.split('\n').find((l) => l.includes('persqm != null')) ?? '';
    const next = map.slice(map.indexOf(line), map.indexOf(line) + 200);
    expect(next).toContain('esc(');
  });

  it('the popup link says what it opens, and names the address for a reader', () => {
    expect(map).toContain('MAP_COPY.search');
    expect(map).toContain('aria-label=');
    expect(MAP_COPY.search).toBe('Google');
    expect(MAP_COPY.searchFull('9 Llewellyn Circle')).toBe('Search Google for 9 Llewellyn Circle');
  });

  it('the popup prints metres, with the separator four digits need', () => {
    expect(MAP_COPY.perSqm(1770)).toBe('£1,770/m²');
  });
});

describe('non-standard sales are excluded, and the exclusion is not silent (C3)', () => {
  /**
   * The pipeline has kept `category = 'A'` only since it was written, so a
   * category B sale never reached the app — the worry that they were shown as
   * ordinary evidence did not hold. What DID need fixing is that the filter was
   * invisible: a sector can lose a third of its sales with no hint why.
   *
   * The line states the POLICY and carries NO number. A per-sector count was
   * built and removed: the comparables are clipped by radius, period and
   * filters, so a whole-sector figure describes a different population from the
   * rows beside it. A truthful count needs the excluded sales' coordinates,
   * which is what we decline to ship.
   */
  const build = readFileSync(fileURLToPath(new URL('../../pipeline/build.mjs', import.meta.url)), 'utf8');

  it('the pipeline keeps category A only', () => {
    expect(build).toContain("WHERE p.category = 'A'");
  });

  it('and ships NO category B row, and no count it could not scope', () => {
    expect(build, 'no B rows').not.toMatch(/category\s*=\s*'B'/);
    expect(build).not.toContain('nonStandardExcluded');
  });

  it('the line says sales are left out, and NEVER calls one a repossession', () => {
    const N = COMPARABLES.nonStandard;
    expect(N.line).toBe('Sales Land Registry marks non-standard are left out.');
    expect(N.line.toLowerCase()).not.toMatch(/repossession/);
    // The tooltip may LIST what the category can contain, because that is what
    // Land Registry says it contains; what must never exist is a row-level claim.
    expect(N.why.toLowerCase()).toContain('does not say which');
  });

  it('the line carries no count, so it cannot contradict the list beside it', () => {
    expect(Object.keys(COMPARABLES.nonStandard)).toEqual(['line', 'why']);
    expect(COMPARABLES.nonStandard.line).not.toMatch(/\d/);
    const mod = read('components/analyser/CompsModule.tsx');
    expect(mod).toContain('COMPARABLES.nonStandard.line');
    expect(mod).not.toContain('nonStandardExcluded');
  });
});

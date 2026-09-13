/**
 * THE REFURB SECTION'S CONTRACT (R1) — the promises the operator was given.
 *
 * The load-bearing one is the last describe: this product must never ship a
 * refurb price nobody wrote. A figure appearing here without the operator
 * putting it there is the failure this file exists to catch.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REFURB, REFURB_ITEMS, paramFor } from './refurb';
import { LABOUR_FACTORS, REFURB_FIGURES, REGION_MULTIPLIERS, FIGURES_REVIEWED, FIGURES_INCLUDE_VAT, figureFor, hasAnyFigure, suggestionsReady } from './refurbFigures';
import { LABOUR_OPTIONS, DEFAULT_LABOUR } from './refurb';
import { REGION_IDS } from '@gil-bricks/core';
import { REGION_LABELS, labelsCoverEveryRegion } from './regions';
import { ANALYSER_SECTIONS } from './analyserSections';
import { strategies } from '@gil-bricks/core';

const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

describe('the items', () => {
  it('covers the big-ticket list the operator asked for', () => {
    const labels = REFURB_ITEMS.map((i) => i.label.toLowerCase()).join(' | ');
    for (const wanted of ['rewire', 'plumbing', 'boiler', 'kitchen', 'bathroom', 'windows', 'roof',
      'plastering', 'flooring', 'damp', 'rip-out', 'garden', 'decoration', 'anything else']) {
      expect(labels, wanted).toContain(wanted);
    }
  });

  it('every key is unique, and so is every param it writes', () => {
    const keys = REFURB_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    const params = REFURB_ITEMS.map((i) => paramFor(i.key));
    expect(new Set(params).size).toBe(params.length);
  });

  it('no item param can collide with a strategy field — the URL would fight itself', () => {
    const fieldKeys = new Set(strategies.flatMap((s) => [...s.strategyInputs, ...s.assumptions]).map((f) => f.key));
    for (const item of REFURB_ITEMS) expect(fieldKeys.has(paramFor(item.key)), item.key).toBe(false);
  });

  it('drives the field the Deal Score actually reads', () => {
    expect(REFURB.fieldKey).toBe('refurbCost');
    // and every strategy really does have that field to be driven
    for (const s of strategies) {
      const all = [...s.strategyInputs, ...s.assumptions].map((f) => f.key);
      expect(all, s.id).toContain(REFURB.fieldKey);
    }
  });
});

describe('the section sits before the verdict', () => {
  it('its chip is after the inputs and BEFORE the verdict in the strip', () => {
    const ids = ANALYSER_SECTIONS.map((s) => s.id);
    expect(ids).toContain(REFURB.sectionId);
    expect(ids.indexOf(REFURB.sectionId)).toBeGreaterThan(ids.indexOf('sec-inputs'));
    expect(ids.indexOf(REFURB.sectionId)).toBeLessThan(ids.indexOf('sec-verdict'));
  });

  it('and the page renders it there too, in all four verdicts', () => {
    for (const f of ['BtlVerdict', 'FlipVerdict', 'BrrrrVerdict', 'HmoVerdict']) {
      const src = read(`../components/analyser/${f}.tsx`);
      const refurbAt = src.indexOf('<RefurbSection');
      const inputsAt = src.indexOf('<StrategyInputs');
      const verdictAt = src.indexOf('id="sec-verdict"');
      expect(refurbAt, f).toBeGreaterThan(-1);
      expect(refurbAt, f).toBeGreaterThan(inputsAt);
      expect(verdictAt, f).toBeGreaterThan(refurbAt);
    }
  });
});

describe('the old Light / Moderate / Heavy is gone, not kept alongside', () => {
  it('no dropdown, no labels, no state field', () => {
    expect(read('../components/analyser/SubjectForm.tsx')).not.toContain('f-refurb');
    expect(read('./analyserForm.ts')).not.toContain('Refurb needed');
    const state = read('../components/analyser/state.ts');
    expect(state).not.toContain("'light' | 'moderate'");
  });

  it('an old link still parses — its level is simply ignored', () => {
    // the adjective never produced a number, so nothing to carry but the figure
    expect(read('../components/analyser/state.ts')).toContain('legacyRefurbLevel');
  });
});

describe('NOTHING SHIPS A REFURB PRICE THE OPERATOR DID NOT WRITE', () => {
  it('every figure is empty until he fills it in', () => {
    for (const [key, spec] of Object.entries(REFURB_FIGURES)) {
      for (const f of ['mid', 'low', 'high'] as const) {
        expect(spec[f], `${key}.${f} must be null until the operator writes it`).toBeNull();
      }
      for (const [band, v] of Object.entries(spec.bands ?? {})) {
        for (const f of ['mid', 'low', 'high'] as const) {
          expect(v[f], `${key}.bands.${band}.${f}`).toBeNull();
        }
      }
    }
    expect(hasAnyFigure()).toBe(false);
    expect(suggestionsReady()).toBe(false);
  });

  it('no regional multiplier and no labour factor is invented either', () => {
    for (const [k, v] of Object.entries(REGION_MULTIPLIERS)) expect(v, `region ${k}`).toBeNull();
    for (const [k, v] of Object.entries(LABOUR_FACTORS)) expect(v, `labour ${k}`).toBeNull();
  });

  it('and no compile date or VAT basis is claimed', () => {
    expect(FIGURES_REVIEWED).toBeNull();
    expect(FIGURES_INCLUDE_VAT).toBeNull();
  });

  it('so no item offers a suggestion at all', () => {
    for (const item of REFURB_ITEMS) expect(figureFor(item.key), item.key).toBeNull();
  });

  it('the shipped tables hold no number anywhere', () => {
    const src = read('./refurbFigures.ts');
    const table = src.slice(src.indexOf('export const REFURB_FIGURES'), src.indexOf('export const FIGURES_REVIEWED'));
    // band KEYS like '1-2' and '4+' are quoted; a bare `: 4500` is a figure
    expect(table).not.toMatch(/\b(mid|low|high)\s*:\s*\d/);
    expect(table).not.toMatch(/^\s*'?[a-z-]+'?\s*:\s*[\d.]+,/mi);
  });

  it('the item list carries no prices either', () => {
    const src = read('./refurb.ts');
    const list = src.slice(src.indexOf('export const REFURB_ITEMS'), src.indexOf('export function paramFor'));
    expect(list).not.toMatch(/£\s*\d|:\s*\d{3,}/);
  });

  it('every item has a figures slot, and every slot an item — so one cannot be renamed alone', () => {
    expect(Object.keys(REFURB_FIGURES).sort()).toEqual(REFURB_ITEMS.map((i) => i.key).sort());
  });
});

describe('R2 — region, labour and the shape the research must arrive in', () => {
  it('every region has a multiplier slot and a label', () => {
    expect(Object.keys(REGION_MULTIPLIERS).sort()).toEqual([...REGION_IDS].sort());
    expect(labelsCoverEveryRegion()).toBe(true);
    expect(Object.keys(REGION_LABELS).sort()).toEqual([...REGION_IDS].sort());
  });

  it('every labour option has a factor slot, and the default is the builder baseline', () => {
    expect(Object.keys(LABOUR_FACTORS).sort()).toEqual(LABOUR_OPTIONS.map((o) => o.id).sort());
    expect(LABOUR_OPTIONS.map((o) => o.id)).toContain(DEFAULT_LABOUR);
    expect(DEFAULT_LABOUR).toBe('builder');
  });

  it('the DIY option says out loud what it leaves out', () => {
    const diy = LABOUR_OPTIONS.find((o) => o.id === 'diy');
    expect(diy?.note.toLowerCase()).toContain('free');
  });

  it('every item declares how it scales, and the sized ones are sized', () => {
    const driverOf = (k: string) => REFURB_ITEMS.find((i) => i.key === k)?.driver;
    expect(driverOf('flooring')).toBe('perSqm');
    expect(driverOf('plastering')).toBe('perSqm');
    expect(driverOf('rewire')).toBe('beds');
    expect(driverOf('windows')).toBe('perUnit');
    for (const i of REFURB_ITEMS) expect(['flat', 'perSqm', 'beds', 'perUnit'], i.key).toContain(i.driver);
  });

  it('partial data offers nothing — one filled item is not enough on its own', () => {
    // suggestionsReady needs an item AND every region AND every labour factor
    expect(suggestionsReady()).toBe(false);
  });
});

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
import { REFURB_FIGURES, figureFor, hasAnyFigure } from './refurbFigures';
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
    for (const [key, value] of Object.entries(REFURB_FIGURES)) {
      expect(value, `${key} must be null until the operator writes it`).toBeNull();
    }
    expect(hasAnyFigure()).toBe(false);
  });

  it('so no item offers a suggestion at all', () => {
    for (const item of REFURB_ITEMS) expect(figureFor(item.key), item.key).toBeNull();
  });

  it('the figures file holds no number anywhere — not even in a comment example that could be copied wrong', () => {
    const src = read('./refurbFigures.ts');
    const table = src.slice(src.indexOf('export const REFURB_FIGURES'), src.indexOf('export const REFURB_FIGURES_LABEL'));
    expect(table).not.toMatch(/:\s*\d/);
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

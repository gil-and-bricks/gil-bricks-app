/**
 * DP1 — the rules that govern the deal pack.
 *
 * This is the file to be strictest in. The pack is the first thing the product
 * makes that one person shows another to influence a financial decision, and
 * every rule below is the difference between an evidenced document and a sales
 * sheet with our name at the bottom.
 */
import { describe, expect, it } from 'vitest';
import {
  LOCKED_SECTIONS,
  NEVER_IN_A_PACK,
  PackHonestyError,
  assertLocked,
  checkFreeText,
  citable,
  citableOnly,
  figure,
  withLocked,
  type BannedPhrase,
} from './honesty';

const BANNED: BannedPhrase[] = [
  { phrase: 'guaranteed', why: 'No property return is guaranteed. Say what the figure is based on instead.' },
  { phrase: 'guarantee', why: 'No property return is guaranteed. Say what the figure is based on instead.' },
  { phrase: 'risk-free', why: 'Property is not risk-free. Naming the risks is what builds trust.' },
  { phrase: 'no risk', why: 'Property is not risk-free. Naming the risks is what builds trust.' },
  { phrase: 'assured return', why: 'An assured return is a regulated promise. Call it an estimate and show the basis.' },
];

describe('words that cannot appear', () => {
  it.each(BANNED)('refuses "$phrase"', ({ phrase }) => {
    const out = checkFreeText(`This deal offers a ${phrase} for the investor.`, BANNED);
    expect(out.ok).toBe(false);
    expect(out.hits.map((h) => h.phrase)).toContain(phrase);
  });

  /** A silent strip would teach nothing and leave them believing they said it. */
  it('explains rather than rejecting silently', () => {
    const out = checkFreeText('A guaranteed return, risk-free.', BANNED);
    expect(out.ok).toBe(false);
    for (const hit of out.hits) {
      expect(hit.why.length, `${hit.phrase} has no explanation`).toBeGreaterThan(20);
      expect(hit.context, `${hit.phrase} shows no context`).not.toBe('');
    }
  });

  /** Fixing one phrase and being refused again for the next teaches only that
   *  the software is hostile. Every hit comes back at once. */
  it('reports every hit, not just the first', () => {
    const out = checkFreeText('A guaranteed, risk-free, assured return.', BANNED);
    expect(out.hits.length).toBeGreaterThanOrEqual(3);
  });

  it('is case-insensitive', () => {
    expect(checkFreeText('GUARANTEED returns', BANNED).ok).toBe(false);
    expect(checkFreeText('Risk-Free', BANNED).ok).toBe(false);
  });

  /**
   * WHOLE WORDS ONLY, and this matters: "guarantee" must not fire on a
   * legitimate sentence about a builder's warranty, and an honest sentence
   * must be allowed through or people stop writing anything at all.
   */
  it('lets honest text through', () => {
    for (const ok of [
      'Estimated return on cash of 14%, based on the figures in this pack.',
      'The roof was replaced in 2019 and the work is under warranty.',
      'Three sold comparables within a quarter of a mile.',
    ]) {
      expect(checkFreeText(ok, BANNED).ok, ok).toBe(true);
    }
  });

  it('says nothing about empty text', () => {
    expect(checkFreeText('', BANNED).ok).toBe(true);
    expect(checkFreeText('   ', BANNED).ok).toBe(true);
  });

  it('reads through markup rather than being fooled by it', () => {
    expect(checkFreeText('A <b>guaranteed</b> return', BANNED).ok).toBe(false);
  });
});

describe('no figure without its basis', () => {
  it('builds a figure that carries where it came from', () => {
    const f = figure('Return on cash', '14.2%', 'Your figures in this pack, before tax.', true);
    expect(f.basis).not.toBe('');
    expect(f.projected).toBe(true);
  });

  /** The choke point. A page cannot print a number and forget the line under it. */
  it('refuses a figure with no basis', () => {
    expect(() => figure('Return on cash', '14.2%', '')).toThrow(PackHonestyError);
    expect(() => figure('Return on cash', '14.2%', '   ')).toThrow(PackHonestyError);
  });

  it('and the refusal says which figure and why', () => {
    expect(() => figure('Return on cash', '14.2%', '')).toThrow(/Return on cash.*where it came from/s);
  });
});

describe('no modelled figure may be called a valuation', () => {
  it.each(['valuation', 'valuations', 'valued at', 'valuer'])('refuses "%s" in the basis', (word) => {
    expect(() => figure('End value', '£260,000', `Our ${word} of the property.`)).toThrow(PackHonestyError);
  });

  it('refuses it in the label too', () => {
    expect(() => figure('Valuation', '£260,000', 'Sold prices nearby.')).toThrow(PackHonestyError);
  });

  it('explains that a valuation is a regulated act', () => {
    expect(() => figure('Valuation', '£1', 'x')).toThrow(/regulated act by a qualified valuer/);
  });

  /** The honest words for the same thing are allowed. */
  it('allows "estimate" and "estimated from sold prices"', () => {
    expect(() => figure('Estimated end value', '£260,000', 'Estimated from sold prices nearby.')).not.toThrow();
  });
});

describe('no comparable without its source and its date', () => {
  const good = { address: '12 Example Street', price: '£182,000', source: 'HM Land Registry Price Paid Data', soldOn: '2026-03-14' };

  it('accepts one that can be cited', () => {
    expect(citable(good)).toBe(true);
  });

  it.each(['source', 'soldOn', 'address', 'price'])('drops one with no %s', (missing) => {
    expect(citable({ ...good, [missing]: '' })).toBe(false);
    expect(citable({ ...good, [missing]: undefined })).toBe(false);
  });

  it('filters a list down to what can be cited', () => {
    const kept = citableOnly([good, { ...good, source: '' }, { ...good, soldOn: '' }]);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toEqual(good);
  });
});

describe('what a pack may never show, whatever anybody ticks', () => {
  /** Our internal read on a deal is not ours to lend to somebody's sales pitch. */
  it('names the Deal Score and the verdict', () => {
    expect(NEVER_IN_A_PACK).toContain('dealScore');
    expect(NEVER_IN_A_PACK).toContain('verdict');
  });

  it('and the things that would give the score away sideways', () => {
    expect(NEVER_IN_A_PACK).toContain('bindingConstraint');
    expect(NEVER_IN_A_PACK).toContain('lever');
  });
});

describe('the locked sections cannot be removed', () => {
  it('names the three', () => {
    expect([...LOCKED_SECTIONS].sort()).toEqual(['basis', 'compliance', 'disclaimer']);
  });

  it('refuses a selection that dropped one', () => {
    expect(() => assertLocked(['cover', 'numbers'])).toThrow(PackHonestyError);
    expect(() => assertLocked(['disclaimer', 'basis'])).toThrow(/compliance/);
  });

  it('accepts one that kept them all', () => {
    expect(() => assertLocked(['cover', 'disclaimer', 'basis', 'compliance'])).not.toThrow();
  });

  /** A disabled tick box is a suggestion. This is the rule. */
  it('puts them back whatever the user sent', () => {
    expect(withLocked(['cover']).sort()).toEqual(['basis', 'compliance', 'cover', 'disclaimer']);
    expect(withLocked([]).sort()).toEqual(['basis', 'compliance', 'disclaimer']);
  });

  it('does not duplicate one already selected', () => {
    expect(withLocked(['disclaimer', 'disclaimer']).filter((s) => s === 'disclaimer')).toHaveLength(1);
  });

  it('the refusal says why they exist, not just that they are required', () => {
    expect(() => assertLocked([])).toThrow(/keep the sender inside the rules/);
  });
});

/**
 * THE BOUNDARY. This module refuses things; it must not be reachable from the
 * scoring path, or a refusal could one day change a number the analyser shows.
 */
describe('the pack rules are not wired into the score', () => {
  it('honesty imports nothing from the score', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./honesty.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from '\.\.\/score/);
    expect(src).not.toMatch(/scoreDeal/);
  });
});

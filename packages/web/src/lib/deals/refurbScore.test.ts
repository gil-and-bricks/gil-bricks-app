/**
 * THE ITEMISED TOTAL REACHES THE SCORE BY EXACTLY ONE PATH (R1).
 *
 * The refurb section can produce a figure two ways — typed into the total, or
 * added up from the ticked rows. Those must be the same number to the Deal
 * Score, or the section has quietly introduced a second maths. The list writes
 * its sum back into `refurbCost`, which is the only param the score ever reads,
 * and these tests hold that: same figure, same score, same verdict line, byte
 * for byte, on all four strategies.
 *
 * The last describe is the one that matters on a saved deal: a builder's quote
 * still replaces the refurb figure, whether or not the person itemised it.
 */
import { describe, expect, it } from 'vitest';
import { sumRefurbLines, type RefurbLine } from '@gil-bricks/core';
import { applyFacts, type DealFact } from './facts';
import { scoreFromParams } from './scoreFromParams';
import { paramFor } from '../../config/refurb';
import { MODE_PARAM } from '../../components/analyser/RefurbSection';

const band = (v: number) => ({ estimate: Math.round(v * 1.05), high: Math.round(v * 1.15) });
const quote = (value: number): DealFact =>
  ({ id: 'f1', deal_id: 'd1', fact_type: 'builder-quote', value, entered_at: '2026-09-06T09:00:00.000Z' });

/** The rows someone might tick to reach £30,000. */
const LINES: RefurbLine[] = [
  { key: 'ripOut', ticked: true, amount: 2_500 },
  { key: 'rewire', ticked: true, amount: 5_500 },
  { key: 'kitchen', ticked: true, amount: 8_000 },
  { key: 'bathroom', ticked: true, amount: 4_000 },
  { key: 'plastering', ticked: true, amount: 6_000 },
  { key: 'decoration', ticked: true, amount: 4_000 },
];
const SUM = sumRefurbLines(LINES);

/** The same deal, itemised: the rows in the URL and the sum written back. */
const itemisedParams = (base: string): string => {
  const p = new URLSearchParams(base);
  p.set(MODE_PARAM, '1');
  for (const l of LINES) p.set(paramFor(l.key), String(l.amount));
  p.set('refurbCost', String(SUM));
  return p.toString();
};

interface Case { strategy: string; params: string; endValue: number }
const CASES: Case[] = [
  { strategy: 'btl', params: 'postcode=CF24+4AA&price=150000&type=T&rent=1400&refurbCost=30000', endValue: 150_000 },
  { strategy: 'brrrr', params: 'postcode=CF11+9AB&price=95000&type=T&rent=1250&arv=190000&refurbCost=30000', endValue: 190_000 },
  { strategy: 'flip', params: 'postcode=NP20+1AA&price=160000&type=S&gdv=260000&refurbCost=30000', endValue: 260_000 },
  { strategy: 'hmo', params: 'postcode=SA1+6HW&price=85000&type=S&roomRent=550&refurbCost=30000&rooms=5', endValue: 85_000 },
];

it('the rows really do add up to the figure being compared', () => {
  expect(SUM).toBe(30_000);
});

describe('an itemised £30,000 scores exactly as a typed £30,000', () => {
  for (const c of CASES) {
    it(`${c.strategy}: same score, same figure, same verdict line`, () => {
      const ev = band(c.endValue);
      expect(scoreFromParams(c.strategy, itemisedParams(c.params), ev))
        .toEqual(scoreFromParams(c.strategy, c.params, ev));
    });
  }
});

describe('the rows are carried, not just the total', () => {
  for (const c of CASES) {
    it(`${c.strategy}: every ticked row survives the round trip through the URL`, () => {
      const p = new URLSearchParams(itemisedParams(c.params));
      for (const l of LINES) expect(p.get(paramFor(l.key)), l.key).toBe(String(l.amount));
      expect(p.get(MODE_PARAM)).toBe('1');
    });
  }
});

describe('a builder’s quote still replaces the refurb figure', () => {
  for (const c of CASES) {
    it(`${c.strategy}: the quote moves the score, and the rows are untouched`, () => {
      const ev = band(c.endValue);
      const itemised = itemisedParams(c.params);
      const quoted = applyFacts(c.strategy, itemised, [quote(48_000)]);
      // the quote won
      expect(new URLSearchParams(quoted).get('refurbCost')).toBe('48000');
      expect(scoreFromParams(c.strategy, quoted, ev)).not.toEqual(scoreFromParams(c.strategy, itemised, ev));
      // and it wiped nothing: every row is still in the params, ready to be shown
      const p = new URLSearchParams(quoted);
      for (const l of LINES) expect(p.get(paramFor(l.key)), l.key).toBe(String(l.amount));
    });
  }
});

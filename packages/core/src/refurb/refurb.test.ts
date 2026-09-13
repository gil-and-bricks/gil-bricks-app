/**
 * THE REFURB TOTAL (R1). The rule that matters most is the third one: a
 * builder's quote must supersede an itemised list VISIBLY, never wipe it and
 * never be quietly overwritten by it.
 */
import { describe, expect, it } from 'vitest';
import { REFURB_MODE, anyTicked, refurbMode, refurbTotal, sumRefurbLines, type RefurbLine } from './index';

const line = (key: string, ticked: boolean, amount: number): RefurbLine => ({ key, ticked, amount });

describe('summing the ticked lines', () => {
  it('adds only what is ticked', () => {
    expect(sumRefurbLines([line('a', true, 4000), line('b', false, 9999), line('c', true, 500)])).toBe(4500);
  });

  it('a ticked line with nothing typed is zero, not a guess', () => {
    expect(sumRefurbLines([line('a', true, 0), line('b', true, 1200)])).toBe(1200);
  });

  it('ticking nothing is zero — and is not the same as a typed zero', () => {
    expect(sumRefurbLines([line('a', false, 5000)])).toBe(0);
    expect(anyTicked([line('a', false, 5000)])).toBe(false);
  });

  it('ignores a negative or broken amount rather than subtracting it', () => {
    expect(sumRefurbLines([line('a', true, -500), line('b', true, 1000), line('c', true, NaN)])).toBe(1000);
  });
});

describe('which number is in charge', () => {
  it('nothing ticked: the typed figure rules', () => {
    expect(refurbMode([line('a', false, 0)], 12000)).toBe(REFURB_MODE.typed);
    expect(refurbTotal([line('a', false, 0)], 12000)).toBe(12000);
  });

  it('ticked and agreeing with the stored total: the list rules', () => {
    const lines = [line('a', true, 4000), line('b', true, 2000)];
    expect(refurbMode(lines, 6000)).toBe(REFURB_MODE.itemised);
    expect(refurbTotal(lines, 6000)).toBe(6000);
  });

  it('ticked with nothing stored yet: the list rules', () => {
    const lines = [line('a', true, 4000)];
    expect(refurbMode(lines, null)).toBe(REFURB_MODE.itemised);
    expect(refurbTotal(lines, null)).toBe(4000);
  });

  it('A BUILDER’S QUOTE SUPERSEDES THE LIST: the quote wins, the list survives', () => {
    const lines = [line('a', true, 4000), line('b', true, 2000)];
    // a quote of £18,000 has replaced refurbCost
    expect(refurbMode(lines, 18000)).toBe(REFURB_MODE.superseded);
    expect(refurbTotal(lines, 18000)).toBe(18000);
    // and the list is untouched — it is still there to show
    expect(sumRefurbLines(lines)).toBe(6000);
    expect(anyTicked(lines)).toBe(true);
  });

  it('a stale list never overwrites the figure that replaced it', () => {
    const lines = [line('a', true, 4000)];
    // whatever the list says, the stored figure is what the score gets
    expect(refurbTotal(lines, 18000)).toBe(18000);
  });

  it('unticking everything hands the figure back, keeping the number', () => {
    const cleared = [line('a', false, 0), line('b', false, 0)];
    expect(refurbMode(cleared, 6000)).toBe(REFURB_MODE.typed);
    expect(refurbTotal(cleared, 6000)).toBe(6000);
  });

  it('a typed total and an identical itemised total reach the score as the same number', () => {
    const typed = refurbTotal([line('a', false, 0)], 6000);
    const itemised = refurbTotal([line('a', true, 4000), line('b', true, 2000)], 6000);
    expect(itemised).toBe(typed);
  });
});

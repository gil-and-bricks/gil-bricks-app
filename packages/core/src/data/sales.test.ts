/**
 * DP2 — which comparables a reader is shown is a decision about the deal, so it
 * is tested like one.
 */
import { describe, expect, it } from 'vitest';
import { salesByPrice } from './sales';
import type { Sale } from './types';

const sale = (price: number, id: string): Sale => ({
  id, date: '2026-01-01', price, paon: id, saon: '', street: 'Test Street',
  town: 'Town', postcode: 'CF37 1HR', type: 'T', tenure: 'F', newBuild: false,
  lat: 0, lng: 0, floorAreaSqm: null, ppsqm: null,
});

describe('ranking sold records', () => {
  it('puts the highest price first', () => {
    const out = salesByPrice([sale(100000, 'a'), sale(300000, 'b'), sale(200000, 'c')], 10);
    expect(out.map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('caps the list so one page cannot become forty addresses', () => {
    const many = Array.from({ length: 40 }, (_, i) => sale(i * 1000, `s${i}`));
    expect(salesByPrice(many, 8)).toHaveLength(8);
  });

  it('never mutates the caller’s array — the sector file is shared', () => {
    const input = [sale(100000, 'a'), sale(300000, 'b')];
    salesByPrice(input, 10);
    expect(input.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('survives an empty list and a nonsense cap', () => {
    expect(salesByPrice([], 8)).toEqual([]);
    expect(salesByPrice([sale(1, 'a')], -5)).toEqual([]);
  });
});

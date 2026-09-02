import { describe, expect, it } from 'vitest';
import { iqm, modalDecile, salesByMonth, saleShare, typicalPriceByType, windowMonths } from './stats.mjs';

const sale = (over) => ({ price: 100000, type: 'T', tenure: 'F', newBuild: false, date: '2026-07-01', ...over });

describe('typicalPriceByType', () => {
  it('IQM per type, null under 3 sales, O excluded', () => {
    const sales = [
      sale({ type: 'T', price: 100000 }),
      sale({ type: 'T', price: 120000 }),
      sale({ type: 'T', price: 500000 }), // IQM of 3 drops none (floor(3/4)=0) → mean 240000
      sale({ type: 'D', price: 300000 }),
      sale({ type: 'O', price: 1 }),
    ];
    const t = typicalPriceByType(sales);
    expect(t.T).toBe(iqm([100000, 120000, 500000]));
    expect(t.D).toBeNull(); // only 1 detached
    expect(t.F).toBeNull();
    expect('O' in t).toBe(false);
  });
});

describe('saleShare', () => {
  it('fraction to 3dp', () => {
    const sales = [sale({ newBuild: true }), sale({}), sale({})];
    expect(saleShare(sales, (s) => s.newBuild)).toBe(0.333);
  });
});

describe('windowMonths + salesByMonth', () => {
  it('12 months ending at ppdMonth, oldest first', () => {
    const months = windowMonths('2026-07');
    expect(months[0]).toBe('2025-08');
    expect(months[11]).toBe('2026-07');
    expect(months).toHaveLength(12);
  });
  it('counts fall in the right buckets; out-of-window dates ignored', () => {
    const counts = salesByMonth(
      [sale({ date: '2025-08-15' }), sale({ date: '2026-07-02' }), sale({ date: '2026-07-30' }), sale({ date: '2024-01-01' })],
      '2026-07',
    );
    expect(counts[0]).toBe(1);
    expect(counts[11]).toBe(2);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe('modalDecile', () => {
  it('most common decile wins', () => {
    expect(modalDecile({ 3: 2, 7: 5 })).toBe(7);
  });
  it('ties go to the more deprived (lower) decile', () => {
    expect(modalDecile({ 3: 5, 7: 5 })).toBe(3);
  });
  it('null on empty', () => {
    expect(modalDecile({})).toBeNull();
  });
});

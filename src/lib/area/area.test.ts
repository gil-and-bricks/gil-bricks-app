import { describe, expect, it } from 'vitest';
import { decileWords, hpiChangePct, hpiSeries, modalTown, monthLabel } from './area';

describe('hpiChangePct', () => {
  const index = { '2021-06': 100, '2025-06': 110, '2026-06': 121 };
  it('computes 1y change to 1dp', () => {
    expect(hpiChangePct(index, '2026-06', 1)).toBe(10); // 110 → 121 = +10.0%
  });
  it('computes 5y change', () => {
    expect(hpiChangePct(index, '2026-06', 5)).toBe(21);
  });
  it('null when the start month is missing', () => {
    expect(hpiChangePct(index, '2026-06', 3)).toBeNull();
  });
});

describe('hpiSeries', () => {
  it('returns oldest-first monthly points, skipping gaps', () => {
    const s = hpiSeries({ '2026-04': 1, '2026-06': 3 }, '2026-06', 1);
    expect(s).toEqual([
      { month: '2026-04', value: 1 },
      { month: '2026-06', value: 3 },
    ]);
  });
  it('spans year boundaries', () => {
    const s = hpiSeries({ '2025-12': 5, '2026-01': 6 }, '2026-01', 1);
    expect(s.map((p) => p.month)).toEqual(['2025-12', '2026-01']);
  });
});

describe('decileWords', () => {
  it('names the extremes plainly', () => {
    expect(decileWords(1)).toMatch(/most deprived tenth/);
    expect(decileWords(10)).toMatch(/least deprived tenth/);
  });
});

describe('modalTown', () => {
  it('picks the most common town', () => {
    expect(modalTown([{ town: 'PONTYPRIDD' }, { town: 'CARDIFF' }, { town: 'PONTYPRIDD' }])).toBe('PONTYPRIDD');
  });
  it('null when no towns', () => {
    expect(modalTown([{ town: '' }])).toBeNull();
  });
});

describe('monthLabel', () => {
  it('formats yyyy-mm', () => {
    expect(monthLabel('2026-07')).toBe('July 2026');
  });
});

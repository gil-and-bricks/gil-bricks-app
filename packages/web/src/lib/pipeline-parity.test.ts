import { describe, expect, it } from 'vitest';
import { iqm, percentile } from '@gil-bricks/core';
// plain-JS pipeline module (web owns the data pipeline); parity guards that the
// sector stats built offline match the core stats shown live.
import { iqm as pipeIqm, percentile as pipePctl } from '../../pipeline/stats.mjs';

describe('core stats ↔ pipeline stats parity', () => {
  it('iqm and percentile match across shapes incl. n not divisible by 4', () => {
    const cases = [
      [100],
      [100, 200],
      [5, 1, 4, 2, 3],
      [10, 20, 30, 40, 50, 60, 70],
      [132500, 118000, 96500, 149950, 173000, 122000, 210000, 87500, 138000, 265000, 156000, 127000],
      Array.from({ length: 41 }, (_, i) => (i * 7919) % 1000),
    ];
    for (const xs of cases) {
      expect(iqm(xs)).toBe(pipeIqm(xs));
      expect(percentile(xs, 0.1)).toBe(pipePctl(xs, 0.1));
      expect(percentile(xs, 0.9)).toBe(pipePctl(xs, 0.9));
    }
  });
});

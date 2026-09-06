/**
 * D4 review — the ONE reader for carried criteria. A bad or hostile value must
 * never become a threshold: a minimum ICR of 0 is not a criterion, it is a
 * number every rental engine rejects, and accepting it killed the verdict with
 * an unfixable "these numbers don't work together".
 */
import { describe, expect, it } from 'vitest';
import { criteriaFromParams, criteriaToParams } from './handoff';

const read = (q: string) => criteriaFromParams(new URLSearchParams(q));
const set = (c: ReturnType<typeof read>) => Object.values(c).filter((v) => v !== undefined);

describe('criteria read back out of a URL', () => {
  it('takes the values a person can actually set', () => {
    expect(read('minCashflow=400&minRoi=12&minIcr=1.5&minProfit=25000')).toEqual({
      minCashflow: 400, minRoi: 12, minIcr: 1.5, minProfit: 25000,
    });
  });

  it('refuses an ICR of zero — it is not a bar, it is a crash', () => {
    expect(read('minIcr=0').minIcr).toBeUndefined();
    expect(read('minIcr=0.5').minIcr).toBeUndefined();
    expect(read('minIcr=1').minIcr).toBe(1);
  });

  it('refuses junk, negatives and absurd values on every key', () => {
    for (const q of ['minCashflow=-1', 'minCashflow=abc', 'minCashflow=1e9', 'minRoi=999', 'minProfit=-5', 'minIcr=99']) {
      expect(set(read(q)), q).toEqual([]);
    }
  });

  it('round-trips: what is written is what is read', () => {
    expect(read(new URLSearchParams(criteriaToParams({ minCashflow: 400, minIcr: 1.5 })).toString())).toEqual({
      minCashflow: 400, minRoi: undefined, minIcr: 1.5, minProfit: undefined,
    });
  });

  it('an empty set is no criteria at all', () => {
    expect(set(read(''))).toEqual([]);
    expect(criteriaToParams({})).toEqual({});
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULTS, isReady, parseQuery, toQuery, type UrlState } from './state';

describe('URL state', () => {
  it('round-trips non-default values and drops defaults', () => {
    const s: UrlState = { ...DEFAULTS, postcode: 'CF37 1HR', price: '150000', type: 'T', radius: '1' };
    const q = toQuery(s);
    expect(q).toContain('postcode=CF37+1HR');
    expect(q).not.toContain('period='); // default stays out of the URL
    expect(parseQuery(q)).toEqual(s);
  });
  it('empty state produces an empty query', () => {
    expect(toQuery({ ...DEFAULTS })).toBe('');
  });
  it('ignores unknown params safely', () => {
    const s = parseQuery('?postcode=LS27+0AA&evil=1');
    expect(s.postcode).toBe('LS27 0AA');
    expect((s as unknown as Record<string, string>).evil).toBeUndefined();
  });
  it('isReady needs a full postcode, a price and a type', () => {
    expect(isReady({ ...DEFAULTS, postcode: 'CF37 1HR', price: '150000', type: 'T' })).toBe(true);
    expect(isReady({ ...DEFAULTS, postcode: 'CF37', price: '150000', type: 'T' })).toBe(false);
    expect(isReady({ ...DEFAULTS, postcode: 'CF37 1HR', price: '', type: 'T' })).toBe(false);
    expect(isReady({ ...DEFAULTS, postcode: 'CF37 1HR', price: '150000', type: '' })).toBe(false);
  });
});

import { strategies } from '../../config/strategies';

describe('strategy params in the URL', () => {
  it('no strategy field key may collide with a shared UrlState key', () => {
    const reserved = new Set(Object.keys(DEFAULTS));
    for (const strat of strategies) {
      for (const f of [...strat.strategyInputs, ...strat.assumptions]) {
        expect(reserved.has(f.key), `${strat.id}.${f.key} collides with UrlState`).toBe(false);
      }
    }
  });
  it('visible strategy inputs never exceed six (simplicity law)', () => {
    for (const strat of strategies) {
      expect(strat.strategyInputs.length, strat.id).toBeLessThanOrEqual(6);
    }
  });
  it('extra params serialise beside shared state; defaults omitted', () => {
    const q = toQuery({ ...DEFAULTS, postcode: 'CF37 1HR' }, { rent: '750', deposit: '25' });
    expect(q).toContain('rent=750');
    expect(q).toContain('postcode=CF37+1HR');
  });
});

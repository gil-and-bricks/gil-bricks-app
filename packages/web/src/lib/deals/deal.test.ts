import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../../components/analyser/state';
import { dealShareText, dealTitle } from './deal';

describe('dealTitle', () => {
  it('builds "{type} · {postcode} · {price}"', () => {
    expect(dealTitle({ ...DEFAULTS, type: 'T', postcode: 'CF37 1HR', price: '150000' })).toBe('Terraced · CF37 1HR · £150,000');
  });
  it('drops unknown parts and falls back', () => {
    expect(dealTitle({ ...DEFAULTS, type: '', postcode: 'ls27 0aa', price: '' })).toBe('LS27 0AA');
    expect(dealTitle({ ...DEFAULTS, type: '', postcode: '', price: '' })).toBe('Saved deal');
  });
});

describe('dealShareText', () => {
  it('joins title, key figure and link', () => {
    expect(dealShareText('Terraced · CF37 1HR · £150,000', 'ROI 12.3%', 'https://x/y?z=1')).toBe(
      'Terraced · CF37 1HR · £150,000 — ROI 12.3% https://x/y?z=1',
    );
  });
  it('omits an empty key figure', () => {
    expect(dealShareText('T', '', 'u')).toBe('T u');
  });
});

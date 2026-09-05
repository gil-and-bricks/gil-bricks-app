/**
 * THE OFFICIAL WORKED EXAMPLES (T2). The stamp duty tool is only worth
 * shipping if it matches HMRC and the Welsh Revenue Authority to the pound,
 * so their own published examples are pinned here. A rate edit in rates.json
 * that breaks one of these fails the build — which is the point: a stale
 * stamp duty calculator is the commonest complaint about these tools.
 *
 * Sources (each band table in rates.json carries its own source URL):
 *   https://www.gov.uk/stamp-duty-land-tax/residential-property-rates
 *   https://www.gov.wales/land-transaction-tax-rates-and-bands
 */
import { describe, expect, it } from 'vitest';
import { stampDuty } from '../maths/stampduty';
import { rates } from '../maths/rates';

const ENGLAND = 'E92000001';
const WALES = 'W92000004';
/** A date inside every current table, so these cases never drift with today. */
const ON = '2026-08-30';

const tax = (price: number, country: 'E92000001' | 'W92000004', buyerType: 'standard' | 'additional' | 'firstTimeBuyer'): number =>
  stampDuty({ price, country, buyerType, date: ON }).value.tax;

describe('SDLT — the examples the tool is judged against', () => {
  it('first-time buyer at £425,000: 0% to £300,000 then 5% = £6,250', () => {
    expect(tax(425_000, ENGLAND, 'firstTimeBuyer')).toBe(6_250);
  });

  it('first-time buyer relief stops above £500,000 — £500,001 pays standard rates', () => {
    expect(tax(500_000, ENGLAND, 'firstTimeBuyer')).toBe(10_000);
    expect(tax(500_001, ENGLAND, 'firstTimeBuyer')).toBe(15_000);
  });

  it('moving home at £295,000: 2% on £125,000 + 5% on £45,000 = £4,750', () => {
    expect(tax(295_000, ENGLAND, 'standard')).toBe(4_750);
  });

  it('additional property at £295,000 is £4,750 + 5% of the price = £19,500', () => {
    expect(tax(295_000, ENGLAND, 'additional')).toBe(19_500);
  });
});

describe('LTT — the examples the tool is judged against', () => {
  it('second home in Wales at £260,000: 5% + 8.5% + 10% = £15,950', () => {
    expect(tax(260_000, WALES, 'additional')).toBe(15_950);
  });

  it('main rates at £280,000: 6% on the £55,000 over £225,000 = £3,300', () => {
    expect(tax(280_000, WALES, 'standard')).toBe(3_300);
  });

  it('Wales has no first-time-buyer relief: £425,000 pays the main rates', () => {
    expect(tax(425_000, WALES, 'firstTimeBuyer')).toBe(tax(425_000, WALES, 'standard'));
    expect(tax(425_000, WALES, 'firstTimeBuyer')).toBe(12_375);
  });
});

describe('the rates the tool shows are the rates it used', () => {
  it('every result carries the effective-from date and source of its own table', () => {
    const ftb = stampDuty({ price: 425_000, country: ENGLAND, buyerType: 'firstTimeBuyer', date: ON }).value;
    expect(ftb.effectiveFrom).toBe(rates.sdlt.firstTimeBuyer[0].effectiveFrom);
    expect(ftb.source.url).toContain('gov.uk');

    const welsh = stampDuty({ price: 260_000, country: WALES, buyerType: 'additional', date: ON }).value;
    expect(welsh.effectiveFrom).toBe(rates.ltt.higher[0].effectiveFrom);
    expect(welsh.source.url).toContain('gov.wales');
  });

  it('the band lines add up to the tax and cover the whole price', () => {
    const r = stampDuty({ price: 425_000, country: ENGLAND, buyerType: 'firstTimeBuyer', date: ON }).value;
    expect(r.bands.reduce((a, b) => a + b.tax, 0)).toBeCloseTo(r.tax, 6);
    expect(r.bands.reduce((a, b) => a + b.slice, 0)).toBe(425_000);
  });

  it('rounds DOWN to the nearest pound, as HMRC do — never a pound over', () => {
    // £250,010 standard: 2% × £125,000 + 5% × £10 = £2,500.50 → £2,500
    expect(tax(250_010, ENGLAND, 'standard')).toBe(2_500);
    // whole-pound cases are untouched
    expect(tax(295_000, ENGLAND, 'standard')).toBe(4_750);
  });
});

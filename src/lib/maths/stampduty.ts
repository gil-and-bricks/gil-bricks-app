/**
 * Marginal-band stamp duty engine. England (SDLT) vs Wales (LTT) branches on
 * the ONSPD country code; every band and threshold comes from
 * src/config/rates.json — no rate is hardcoded here (CLAUDE.md).
 * Welsh higher rates are a STANDALONE table, never main + surcharge.
 */
import { assertNonNegative, type Breakdown, type WithBreakdown } from './breakdown';
import { fmtMoney, fmtPct } from './format';
import { pickEffective, rates, today, type Band, type BandTable } from './rates';

export type StampCountry = 'E92000001' | 'W92000004';
export type BuyerType = 'standard' | 'additional' | 'firstTimeBuyer';

export interface BandLine {
  from: number;
  /** The band's nominal upper bound (null = unlimited). */
  to: number | null;
  /** The amount of the price that actually fell in this band. */
  slice: number;
  rate: number;
  tax: number;
}

export interface StampDutyResult {
  tax: number;
  /** Per-band lines for the show-the-maths accordion. */
  bands: BandLine[];
  /** Which regime applied, e.g. "SDLT additional-property rates". */
  regime: string;
}

/** Marginal tax over a band table: each slice of the price at its band's rate. */
export function bandTax(price: number, bands: Band[]): BandLine[] {
  const lines: BandLine[] = [];
  let from = 0;
  for (const b of bands) {
    if (price <= from) break;
    const to = b.upTo === null ? price : Math.min(b.upTo, price);
    const slice = to - from;
    lines.push({ from, to: b.upTo, slice, rate: b.rate, tax: slice * b.rate });
    from = b.upTo ?? price;
  }
  // A table must cover the whole price — a config edit that leaves a gap
  // (e.g. raising a maxPrice above the last band) must fail loudly, never
  // silently under-tax.
  if (from < price) {
    throw new RangeError(`Band table only covers prices up to ${fmtMoney(from)} — cannot tax ${fmtMoney(price)} (check rates.json)`);
  }
  return lines;
}

export interface StampDutyInputs {
  price: number;
  country: StampCountry;
  buyerType: BuyerType;
  /** Transaction date, ISO yyyy-mm-dd; defaults to today. */
  date?: string;
}

export function stampDuty(inputs: StampDutyInputs): WithBreakdown<StampDutyResult> {
  assertNonNegative({ price: inputs.price });
  const onDate = inputs.date ?? today();
  let regime: string;
  let note: string;
  let table: BandTable;

  if (inputs.country === 'E92000001') {
    const sdlt = rates.sdlt;
    if (inputs.buyerType === 'firstTimeBuyer') {
      const ftb = pickEffective(sdlt.firstTimeBuyer as BandTable[], onDate);
      if (ftb.maxPrice !== undefined && inputs.price > ftb.maxPrice) {
        table = pickEffective(sdlt.standard as BandTable[], onDate);
        regime = 'SDLT standard rates';
        note = `no first-time-buyer relief above ${fmtMoney(ftb.maxPrice)} — standard rates apply`;
      } else {
        table = ftb;
        regime = 'SDLT first-time-buyer rates';
        note = 'first-time-buyer relief applied';
      }
    } else if (inputs.buyerType === 'additional' && inputs.price >= sdlt.additionalMinPrice) {
      table = pickEffective(sdlt.additional as BandTable[], onDate);
      regime = 'SDLT additional-property rates';
      note = 'when this is not your only property, every band is taxed at the higher additional-property rate';
    } else {
      table = pickEffective(sdlt.standard as BandTable[], onDate);
      regime = 'SDLT standard rates';
      note =
        inputs.buyerType === 'additional'
          ? `purchases under ${fmtMoney(sdlt.additionalMinPrice)} escape the additional-property rates`
          : 'standard rates for your only residential property';
    }
  } else if (inputs.country === 'W92000004') {
    const ltt = rates.ltt;
    if (inputs.buyerType === 'additional' && inputs.price >= ltt.higherMinPrice) {
      table = pickEffective(ltt.higher as BandTable[], onDate);
      regime = 'LTT higher residential rates';
      note = 'Wales uses its own standalone higher-rates table — not a surcharge on the main rates';
    } else {
      table = pickEffective(ltt.main as BandTable[], onDate);
      regime = 'LTT main residential rates';
      note =
        inputs.buyerType === 'firstTimeBuyer'
          ? 'Wales has no first-time-buyer relief — main rates apply'
          : inputs.buyerType === 'additional'
            ? `purchases under ${fmtMoney(ltt.higherMinPrice)} stay on the main rates`
            : 'main residential rates';
    }
  } else {
    throw new RangeError(`country must be E92000001 (England) or W92000004 (Wales) — got ${String(inputs.country)}`);
  }

  const lines = bandTax(inputs.price, table.bands);
  const tax = lines.reduce((a, l) => a + l.tax, 0);
  const taxed = lines.filter((l) => l.tax > 0);
  const substituted =
    taxed.length === 0
      ? `${fmtMoney(inputs.price)} sits entirely in the 0% band`
      : taxed.map((l) => `${fmtPct(l.rate * 100)} × ${fmtMoney(l.slice)}`).join(' + ');
  const breakdown: Breakdown = {
    label: inputs.country === 'E92000001' ? 'Stamp duty (SDLT)' : 'Land transaction tax (LTT)',
    formula: 'each slice of the price is taxed at its own band rate, then the slices are added up',
    substituted,
    result: fmtMoney(tax),
    note,
  };
  return { value: { tax, bands: lines, regime }, breakdown };
}

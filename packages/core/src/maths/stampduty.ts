/**
 * Marginal-band stamp duty engine. England (SDLT) vs Wales (LTT) branches on
 * the ONSPD country code; every band and threshold comes from
 * src/config/rates.json — no rate is hardcoded here (CLAUDE.md).
 * Welsh higher rates are a STANDALONE table, never main + surcharge.
 */
import { assertNonNegative, type Breakdown, type WithBreakdown } from './breakdown';
import { fmtMoney, fmtPct } from './format';
import { pickEffective, rates, today, type Band, type BandTable, type RateSource } from './rates';

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
  /** Tax owed once this band and every band below it is counted (A1). The
   *  ladder the show-the-maths accordion walks — it used to be added up in the
   *  tool component, which is not where a number may be worked out. */
  running: number;
}

export interface StampDutyResult {
  tax: number;
  /**
   * The tax as a percentage of the price — the average rate actually paid
   * across every band (A1). It is NOT a band rate: no band charges it. Zero
   * when the price is zero.
   */
  effectiveRate: number;
  /** Per-band lines for the show-the-maths accordion. */
  bands: BandLine[];
  /** Which regime applied, e.g. "SDLT additional-property rates". */
  regime: string;
  /**
   * Were the additional-property / higher rates actually used? A page must be
   * able to say "the surcharge IS included" without parsing `regime`, and
   * without re-deriving the threshold rule and getting it subtly wrong.
   */
  surchargeApplied: boolean;
  /** What the caller said they were buying as, echoed back so a page can point
   *  at the control that changes all of this. */
  buyerType: BuyerType;
  /** England or Wales — the rules that were applied, not where the buyer is. */
  country: StampCountry;
  /** The effectiveFrom date of the band table used, straight from rates.json. */
  effectiveFrom: string;
  /** Where those rates were read from, so a page can cite them. */
  source: RateSource;
}

/** Marginal tax over a band table: each slice of the price at its band's rate. */
export function bandTax(price: number, bands: Band[]): BandLine[] {
  const lines: BandLine[] = [];
  let from = 0;
  for (const b of bands) {
    if (price <= from) break;
    const to = b.upTo === null ? price : Math.min(b.upTo, price);
    const slice = to - from;
    const tax = slice * b.rate;
    lines.push({ from, to: b.upTo, slice, rate: b.rate, tax, running: (lines[lines.length - 1]?.running ?? 0) + tax });
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
  let surchargeApplied = false;

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
      surchargeApplied = true;
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
      surchargeApplied = true;
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
  // HMRC round the amount down to the nearest pound (SDLT manual SDLTM00050:
  // "The amount calculated is round down to the nearest pound."), so a price
  // whose slices leave pennies must not come out £1 above the official
  // calculator. The Welsh Revenue Authority publish no rounding rule; the same
  // rounding is applied there, which can only ever understate by pennies.
  const tax = Math.floor(lines.reduce((a, l) => a + l.tax, 0));
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
  const effectiveRate = inputs.price > 0 ? (tax / inputs.price) * 100 : 0;
  return {
    value: {
      tax, effectiveRate, bands: lines, regime, surchargeApplied,
      buyerType: inputs.buyerType, country: inputs.country,
      effectiveFrom: table.effectiveFrom, source: table.source,
    },
    breakdown,
  };
}

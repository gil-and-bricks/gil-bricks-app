/**
 * Score a read listing honestly (E6). BTL is fully scoreable from a sale
 * listing plus one number the user types (rent) and standard assumptions —
 * price/floor-area come from the page + our own data, and "price vs nearby
 * sold" is a REAL component from R2 sector data (or "not enough sales"). The
 * other strategies genuinely need inputs a sale listing never provides
 * (per-room rents + room sizes for HMO; an end value + refurb for Flip/BRRRR),
 * so we DON'T invent them — we say so and hand off to the analyser.
 */
import { strategyById } from '../strategies';
import { scoreDeal, type DealScore, type StrategyId } from '../score/scoreDeal';
import type { BtlInputs } from '../strategy-calc/btl';
import type { CountryCode, SectorFile } from '../data/types';
import { priceVsSector, type PriceVsSold } from './enrich';
import type { NormalisedListing } from './types';

export interface ScoreListingOptions {
  strategy: StrategyId;
  /** Monthly rent the user typed. */
  rent?: number | null;
  /** Overrides of the strategy field defaults (deposit, rate, …). */
  assumptions?: Record<string, string>;
  /** Our R2 sector data (typical prices + country). */
  sector?: SectorFile | null;
  /** Resolved floor area (listing / EPC / manual). */
  floorAreaSqm?: number | null;
  minSectorSales?: number;
}

export interface ScoreListingResult {
  strategy: StrategyId;
  /** Full Deal Score, or null when a required input is still missing. */
  deal: DealScore | null;
  /** Plain labels of what's still needed before a full score. */
  waitingOn: string[];
  /** Real price-vs-nearby-sold read from our sector data (or honest gaps). */
  priceVsSold: PriceVsSold;
  /** ONSPD country used for tax (from the sector data; England if unknown). */
  country: CountryCode;
  /** Honest note for strategies we don't score in-panel; '' for BTL. */
  note: string;
}

function fieldDefaults(strategy: StrategyId): Record<string, string> {
  const cfg = strategyById(strategy);
  const out: Record<string, string> = {};
  for (const f of [...(cfg?.strategyInputs ?? []), ...(cfg?.assumptions ?? [])]) out[f.key] = f.default;
  return out;
}

export function scoreListing(listing: NormalisedListing, opts: ScoreListingOptions): ScoreListingResult {
  const country: CountryCode = opts.sector?.country ?? 'E92000001';
  const minSales = opts.minSectorSales ?? 5;
  const floorArea = opts.floorAreaSqm ?? listing.floorAreaSqm.value;
  const priceVsSold = priceVsSector(listing.askingPrice.value, opts.sector, minSales, floorArea);

  if (opts.strategy !== 'btl') {
    const note =
      opts.strategy === 'hmo'
        ? 'HMO needs per-room rents and room sizes a sale listing can’t give — open it in the analyser.'
        : 'This needs an end value and refurb budget a sale listing can’t give — open it in the analyser.';
    return { strategy: opts.strategy, deal: null, waitingOn: ['open in analyser'], priceVsSold, country, note };
  }

  const price = listing.askingPrice.value;
  if (!price || price <= 0) {
    return { strategy: 'btl', deal: null, waitingOn: ['a price'], priceVsSold, country, note: '' };
  }
  if (!opts.rent || opts.rent <= 0) {
    return { strategy: 'btl', deal: null, waitingOn: ['monthly rent'], priceVsSold, country, note: '' };
  }

  const cfg = strategyById('btl');
  const base = fieldDefaults('btl');
  const d = { ...base, ...(opts.assumptions ?? {}) };
  // Mirror the web's num(): a blank/cleared/non-numeric field falls back to the
  // CONFIG DEFAULT — never a silent 0 (which would invent e.g. a 0% deposit).
  const num = (k: string): number => {
    const raw = d[k];
    const v = Number(raw);
    if (raw !== '' && raw != null && Number.isFinite(v)) return v;
    const bv = Number(base[k]);
    return Number.isFinite(bv) ? bv : 0;
  };
  const sel = (k: string, fallback: string): string => (d[k] && d[k] !== '' ? d[k] : base[k] || fallback);
  const inputs: BtlInputs = {
    price,
    country,
    monthlyRent: opts.rent,
    depositPct: num('deposit'),
    ratePct: num('rate'),
    buyingAs: sel('buyingAs', 'basic') as BtlInputs['buyingAs'],
    selfManaged: sel('mgmt', 'agent') === 'self',
    voidWeeks: num('voidWeeks'),
    agentPct: num('agentPct'),
    maintPct: num('maintPct'),
    insurancePerYear: num('insurance'),
    legals: num('legals'),
    refurb: num('refurbCost'),
    stressRatePct: num('stressRate'),
    taxBasis: sel('taxBasis', 'additional') as BtlInputs['taxBasis'],
    thresholds: cfg!.thresholds as BtlInputs['thresholds'],
  };
  // Real evidence from our sector data — replaces the UNKNOWN price component.
  const evidence =
    opts.sector && opts.sector.stats.count >= minSales
      ? { estimate: opts.sector.stats.typicalPrice, high: opts.sector.stats.p90Price }
      : undefined;

  return { strategy: 'btl', deal: scoreDeal('btl', inputs, evidence), waitingOn: [], priceVsSold, country, note: '' };
}

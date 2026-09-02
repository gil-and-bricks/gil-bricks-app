/**
 * Score a read listing for ANY strategy (E7). Triage supplies at most one or
 * two UNKNOWNS per strategy (rent; end value + refurb; rooms + room rent); all
 * other inputs come from the user's SETTINGS (or config defaults). Personal
 * CRITERIA replace the config thresholds where the user has set them, and the
 * headline names the user's own bar when it's theirs being missed. Price-vs-sold
 * is a real read from our R2 sector data — and honestly excluded when the
 * subject sits outside the local evidence.
 */
import { strategyById } from '../strategies';
import { scoreDeal, type DealScore, type StrategyId } from '../score/scoreDeal';
import type { BtlInputs } from '../strategy-calc/btl';
import type { FlipStrategyInputs } from '../strategy-calc/flip';
import type { BrrrrStrategyInputs } from '../strategy-calc/brrrr';
import type { HmoInputs } from '../strategy-calc/hmo';
import type { CountryCode, SectorFile } from '../data/types';
import { priceVsSector, type PriceVsSold } from './enrich';
import { thresholdsFor, customKeysFor, type Criteria } from './criteria';
import type { NormalisedListing } from './types';

export interface ScoreListingOptions {
  strategy: StrategyId;
  /** Triage unknowns keyed by strategy field key: rent, gdv, arv, refurbCost, rooms, roomRent. */
  unknowns?: Record<string, string>;
  /** Every other input, from the Settings screen (overrides config defaults). */
  settings?: Record<string, string>;
  /** The user's personal bars. */
  criteria?: Criteria;
  sector?: SectorFile | null;
  floorAreaSqm?: number | null;
  minSectorSales?: number;
  evidenceOutsideFactor?: number;
}

export interface ScoreListingResult {
  strategy: StrategyId;
  deal: DealScore | null;
  /** Plain labels of what's still needed before a full score. */
  waitingOn: string[];
  priceVsSold: PriceVsSold;
  country: CountryCode;
  note: string;
}

/** The one or two unknowns each strategy needs before it can score. */
export const REQUIRED_UNKNOWNS: Record<StrategyId, { key: string; label: string }[]> = {
  btl: [{ key: 'rent', label: 'monthly rent' }],
  flip: [{ key: 'gdv', label: 'end value after works' }],
  brrrr: [
    { key: 'arv', label: 'end value after works' },
    { key: 'rent', label: 'monthly rent' },
  ],
  hmo: [{ key: 'roomRent', label: 'rent per room' }],
};

function allDefaults(strategy: StrategyId): Record<string, string> {
  const cfg = strategyById(strategy);
  const out: Record<string, string> = {};
  for (const f of [...(cfg?.strategyInputs ?? []), ...(cfg?.assumptions ?? [])]) out[f.key] = f.default;
  return out;
}

export function scoreListing(listing: NormalisedListing, opts: ScoreListingOptions): ScoreListingResult {
  const country: CountryCode = opts.sector?.country ?? 'E92000001';
  const minSales = opts.minSectorSales ?? 5;
  const outsideFactor = opts.evidenceOutsideFactor ?? 2;
  const floorArea = opts.floorAreaSqm ?? listing.floorAreaSqm.value;
  const price = listing.askingPrice.value;
  const priceVsSold = priceVsSector(price, opts.sector, minSales, floorArea, outsideFactor);

  const base = allDefaults(opts.strategy);
  const d: Record<string, string> = { ...base, ...(opts.settings ?? {}), ...(opts.unknowns ?? {}) };
  const criteria: Criteria = opts.criteria ?? {};
  if (criteria.depositPct != null) d.deposit = String(criteria.depositPct);
  if (criteria.ratePct != null) d.rate = String(criteria.ratePct);

  const empty = { strategy: opts.strategy, deal: null as DealScore | null, priceVsSold, country, note: '' };
  if (!price || price <= 0) return { ...empty, waitingOn: ['a price'] };

  // Which unknowns are still missing?
  const waitingOn = REQUIRED_UNKNOWNS[opts.strategy]
    .filter((u) => !(Number(d[u.key]) > 0))
    .map((u) => u.label);
  if (waitingOn.length) return { ...empty, waitingOn };

  // number reader mirroring the web: blank/invalid ⇒ config default (never 0).
  const num = (k: string): number => {
    const v = Number(d[k]);
    if (d[k] !== '' && d[k] != null && Number.isFinite(v)) return v;
    const bv = Number(base[k]);
    return Number.isFinite(bv) ? bv : 0;
  };
  const sel = (k: string, fb: string): string => (d[k] && d[k] !== '' ? d[k] : base[k] || fb);

  // Strategy-specific gates the web enforces (mirror them so we never call the
  // engine with an input it rejects, and never guess a value):
  if (opts.strategy === 'brrrr') {
    const ltvPct = sel('ltv', '75') === 'custom' ? num('ltvCustom') : Number(sel('ltv', '75'));
    if (!(ltvPct > 0)) return { ...empty, waitingOn: ['your custom loan-to-value %'] };
  }
  if (opts.strategy === 'hmo' && num('rooms') >= 7) {
    return { ...empty, note: '7 or more lettable rooms is a large (sui generis) HMO — outside what this tool covers. Check it in the analyser.', waitingOn: [] };
  }

  const thresholds = thresholdsFor(opts.strategy, criteria) as never;
  const customKeys = customKeysFor(criteria, opts.strategy);

  // Evidence for the scoreDeal price/end-value component uses the value that
  // component judges (price for BTL/HMO, end value for Flip/BRRRR). Exclude it
  // when the sector is thin OR the value sits outside the local evidence.
  const endValue = opts.strategy === 'flip' ? num('gdv') : opts.strategy === 'brrrr' ? num('arv') : price;
  const enoughSales = !!opts.sector && opts.sector.stats.count >= minSales;
  const withinEvidence = enoughSales && endValue <= opts.sector!.stats.p90Price * outsideFactor;
  const evidence = withinEvidence ? { estimate: opts.sector!.stats.typicalPrice, high: opts.sector!.stats.p90Price } : undefined;

  let inputs:
    | (BtlInputs & { thresholds: never })
    | (FlipStrategyInputs & { thresholds: never })
    | (BrrrrStrategyInputs & { thresholds: never })
    | (HmoInputs & { thresholds: never });

  if (opts.strategy === 'btl') {
    inputs = {
      price, country, monthlyRent: num('rent'), depositPct: num('deposit'), ratePct: num('rate'),
      buyingAs: sel('buyingAs', 'basic') as BtlInputs['buyingAs'], selfManaged: sel('mgmt', 'agent') === 'self',
      voidWeeks: num('voidWeeks'), agentPct: num('agentPct'), maintPct: num('maintPct'), insurancePerYear: num('insurance'),
      legals: num('legals'), refurb: num('refurbCost'), stressRatePct: num('stressRate'),
      taxBasis: sel('taxBasis', 'additional') as BtlInputs['taxBasis'], thresholds,
    };
  } else if (opts.strategy === 'flip') {
    inputs = {
      price, country, refurb: num('refurbCost'), gdv: num('gdv'),
      funding: sel('funding', 'bridging') === 'cash' ? 'cash' : 'bridging', months: num('bridgeMonths'),
      agentSalePctExVat: num('agentSalePct'), saleLegals: num('saleLegals'),
      flipAs: sel('flipAs', 'personal') === 'ltd' ? 'ltd' : 'personal', incomeBand: sel('incomeBand', 'higher') === 'basic' ? 'basic' : 'higher',
      bridgeLoanPct: num('bridgeLoanPct'), bridgeRatePctMonth: num('bridgeRate'), arrangementPct: num('arrangementPct'),
      exitPct: num('exitPct'), legals: num('legals'), contingencyPct: num('contingencyPct'),
      taxBasis: sel('taxBasis', 'additional') as FlipStrategyInputs['taxBasis'], thresholds,
    };
  } else if (opts.strategy === 'brrrr') {
    const ltvPct = sel('ltv', '75') === 'custom' ? num('ltvCustom') : Number(sel('ltv', '75'));
    inputs = {
      price, country, refurb: num('refurbCost'), arv: num('arv'),
      funding: sel('funding', 'bridging') === 'cash' ? 'cash' : 'bridging', bridgeMonths: num('bridgeMonths'),
      monthlyRent: num('rent'), ltvPct, buyingAs: sel('buyingAs', 'basic') as BrrrrStrategyInputs['buyingAs'],
      bridgeLoanPct: num('bridgeLoanPct'), bridgeRatePctMonth: num('bridgeRate'), arrangementPct: num('arrangementPct'),
      exitPct: num('exitPct'), legals: num('legals'), refiLegals: num('refiLegals'), voidWeeks: num('voidWeeks'),
      agentPct: num('agentPct'), maintPct: num('maintPct'), insurancePerYear: num('insurance'), refiRatePct: num('rate'),
      stressRatePct: num('stressRate'), taxBasis: sel('taxBasis', 'additional') as BrrrrStrategyInputs['taxBasis'], thresholds,
    };
  } else {
    const selfManaged = sel('mgmt', 'agent') === 'self';
    inputs = {
      price, country, rooms: num('rooms'), roomRent: num('roomRent'), billsIncluded: sel('bills', 'yes') !== 'no',
      refurb: num('refurbCost'), buyingAs: sel('buyingAs', 'basic') as HmoInputs['buyingAs'], selfManaged,
      depositPct: num('deposit'), ratePct: num('rate'), opCostPct: selfManaged ? num('opCostPctSelf') : num('opCostPctAgent'),
      licenceFee: num('licenceFee'), licenceYears: 5, compliancePerYear: num('compliancePerYear'), legals: num('legals'),
      stressRatePct: num('stressRate'), taxBasis: sel('taxBasis', 'additional') as HmoInputs['taxBasis'],
      roomSizeFailures: null, // rooms can't be checked from a sale listing (E7)
      thresholds,
    };
  }

  // Safety net: if a strategy engine still rejects some combination, fail
  // honestly rather than throwing out of the caller (freezing the panel).
  try {
    return { strategy: opts.strategy, deal: scoreDeal(opts.strategy, inputs, evidence, { customKeys }), waitingOn: [], priceVsSold, country, note: '' };
  } catch {
    return { ...empty, note: 'These numbers don’t work together — check your inputs or open it in the analyser.', waitingOn: [] };
  }
}

/** Labelled smart-default suggestions for the triage unknowns (never facts). */
export function smartDefaults(
  strategy: StrategyId,
  listing: NormalisedListing,
  sector: SectorFile | null | undefined,
  floorAreaSqm: number | null | undefined,
  opts?: { minSectorSales?: number; evidenceOutsideFactor?: number },
): Record<string, { value: string; label: string } | { value: null; label: string }> {
  const minSales = opts?.minSectorSales ?? 5;
  const outsideFactor = opts?.evidenceOutsideFactor ?? 2;
  const out: Record<string, { value: string; label: string } | { value: null; label: string }> = {};
  if (strategy === 'hmo' && listing.bedrooms.status === 'found' && listing.bedrooms.value) {
    out.rooms = { value: String(listing.bedrooms.value), label: 'suggested = bedrooms' };
  }
  if (strategy === 'flip' || strategy === 'brrrr') {
    const key = strategy === 'flip' ? 'gdv' : 'arv';
    const price = listing.askingPrice.value;
    if (!sector || sector.stats.count < minSales) {
      out[key] = { value: null, label: 'no suggestion — too few nearby sales' };
    } else if (price != null && price > sector.stats.p90Price * outsideFactor) {
      // The property is outside the local sold evidence — the same evidence that
      // can't judge the price can't support a suggested end value either (E7.1).
      out[key] = { value: null, label: 'no suggestion — no nearby sales at this level' };
    } else if (floorAreaSqm && floorAreaSqm > 0 && sector.stats.typicalPpsqm) {
      const v = Math.round(sector.stats.typicalPpsqm * floorAreaSqm);
      out[key] = { value: String(v), label: `suggested ≈ £${sector.stats.typicalPpsqm.toLocaleString('en-GB')}/m² × ${floorAreaSqm} m²` };
    } else {
      out[key] = { value: String(sector.stats.typicalPrice), label: `suggested ≈ sector typical £${sector.stats.typicalPrice.toLocaleString('en-GB')}` };
    }
  }
  return out;
}

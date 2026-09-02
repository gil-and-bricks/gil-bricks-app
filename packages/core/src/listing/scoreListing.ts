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
import { priceVsSector, type PriceVsSold, type SectorLoad } from './enrich';
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
  /** How the sector fetch resolved — so the sold-price read can say "no data
   * here yet" vs "couldn't load" honestly (E8.1). */
  sectorLoad?: SectorLoad;
  /** Sanity factors (E8.1) — an input/output wildly out of proportion to the
   * price is refused rather than shown as an impossible figure. */
  sanityRefurbMaxFactor?: number;
  sanityEndValueMaxFactor?: number;
  sanityCashMaxFactor?: number;
  /** Whether this listing is an auction (structured flag OR wording) — one source
   * of truth for the auction card and the auction-fees costs line (E8.1). */
  isAuction?: boolean;
}

/** One line in the "what you need to put in" costs card (E8.1). */
export interface CashLine {
  label: string;
  /** null = an amount we can't compute (e.g. auction fees — check the particulars). */
  amount: number | null;
  /** True when the figure is an estimate the user must verify. */
  estimate?: boolean;
}
export interface CashNeeded {
  lines: CashLine[];
  /** Sum of the known (non-null) lines. */
  total: number;
  /** When bridging is used, how the purchase splits into borrowed vs your cash. */
  bridging?: { borrowed: number; cash: number };
  /** True when an auction-fees line (an estimate) is present. */
  hasAuctionEstimate: boolean;
}

export interface ScoreListingResult {
  strategy: StrategyId;
  deal: DealScore | null;
  /** Plain labels of what's still needed before a full score. */
  waitingOn: string[];
  priceVsSold: PriceVsSold;
  country: CountryCode;
  /** The up-front cash breakdown — an OUTPUT shown on the listing view (E8.1). */
  cashNeeded: CashNeeded | null;
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
  const priceVsSold = priceVsSector(price, opts.sector, minSales, floorArea, outsideFactor, opts.sectorLoad ?? 'ok');

  const base = allDefaults(opts.strategy);
  // Per-deal figures (end value, refurb, rent, rooms) are NEVER global settings —
  // strip them from `settings` before the merge so a legacy global value (e.g. a
  // refurbCost once saved on the BTL Settings screen) can't bleed into another
  // listing's score (E8.1 leak fix; the panel also stops writing them globally).
  const PER_DEAL = new Set(['refurbCost', 'arv', 'gdv', 'rent', 'rooms', 'roomRent']);
  const settingsClean = Object.fromEntries(Object.entries(opts.settings ?? {}).filter(([k]) => !PER_DEAL.has(k)));
  const d: Record<string, string> = { ...base, ...settingsClean, ...(opts.unknowns ?? {}) };
  const criteria: Criteria = opts.criteria ?? {};
  if (criteria.depositPct != null) d.deposit = String(criteria.depositPct);
  if (criteria.ratePct != null) d.rate = String(criteria.ratePct);

  const empty = { strategy: opts.strategy, deal: null as DealScore | null, priceVsSold, country, cashNeeded: null as CashNeeded | null, note: '' };
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

  // Sanity guard (E8.1): a remembered/stale input wildly out of proportion to
  // THIS purchase price would produce an impossible figure (e.g. £461,600 stuck
  // on a £72k terrace). Refuse to score and name the culprit rather than show a
  // nonsense number. Factors are config-driven.
  const gbp = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;
  const refurbMax = opts.sanityRefurbMaxFactor ?? 4;
  const endValueMax = opts.sanityEndValueMaxFactor ?? 10;
  const cashMax = opts.sanityCashMaxFactor ?? 5;
  const refurbIn = num('refurbCost');
  if (refurbIn > price * refurbMax) {
    return { ...empty, note: `The refurb figure (${gbp(refurbIn)}) looks wrong for a ${gbp(price)} property — check it or clear it.`, waitingOn: [] };
  }
  const endIn = opts.strategy === 'flip' ? num('gdv') : opts.strategy === 'brrrr' ? num('arv') : 0;
  if (endIn > 0 && endIn > price * endValueMax) {
    return { ...empty, note: `The end value (${gbp(endIn)}) looks wrong for a ${gbp(price)} purchase — check it.`, waitingOn: [] };
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
      selfManaged: sel('mgmt', 'agent') === 'self',
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
    const deal = scoreDeal(opts.strategy, inputs, evidence, { customKeys });
    // Output backstop: any headline cash figure impossibly large vs the price
    // must never be displayed — fail honestly instead (E8.1).
    const an = deal.analysis as { cashInvested?: { value: number }; cashIn?: { value: number }; moneyLeftIn?: number };
    const cashIn = an.cashInvested?.value ?? an.cashIn?.value ?? 0;
    const mli = typeof an.moneyLeftIn === 'number' ? an.moneyLeftIn : 0;
    if (cashIn > price * cashMax || Math.abs(mli) > price * cashMax) {
      return { ...empty, note: `These figures don’t look right for a ${gbp(price)} property — check your inputs (especially refurb and end value).`, waitingOn: [] };
    }
    const cashNeeded = buildCashNeeded(opts.strategy, num, sel, price, country, deal.analysis, opts.isAuction ?? listing.isAuction.value === true);
    return { strategy: opts.strategy, deal, waitingOn: [], priceVsSold, country, cashNeeded, note: '' };
  } catch {
    return { ...empty, note: 'These numbers don’t work together — check your inputs or open it in the analyser.', waitingOn: [] };
  }
}

/**
 * The up-front cash breakdown (E8.1) — an OUTPUT card, itemised in plain
 * English, computed from the SAME inputs the engine scored with (never a second
 * source of truth). Auction fees are shown as an unpriced estimate to check.
 */
function buildCashNeeded(
  strategy: StrategyId,
  num: (k: string) => number,
  sel: (k: string, fb: string) => string,
  price: number,
  country: CountryCode,
  analysis: DealScore['analysis'],
  isAuction: boolean,
): CashNeeded {
  const an = analysis as { stampDutyTax?: number; stampDuty?: { value: { tax: number } } };
  const sdlt = an.stampDutyTax ?? an.stampDuty?.value.tax ?? 0;
  const taxName = country === 'W92000004' ? 'Land Transaction Tax (LTT)' : 'Stamp Duty (SDLT)';
  const legals = num('legals');
  const refurb = num('refurbCost');
  const funding = sel('funding', strategy === 'flip' || strategy === 'brrrr' ? 'bridging' : 'mortgage');
  const bridging = (strategy === 'flip' || strategy === 'brrrr') && funding === 'bridging';

  const lines: CashLine[] = [];
  let borrowed = 0;
  let cashIntoPurchase = 0;
  if (bridging) {
    const bridgeLoanPct = num('bridgeLoanPct');
    borrowed = price * (bridgeLoanPct / 100);
    cashIntoPurchase = price - borrowed;
    lines.push({ label: 'Deposit into the bridge', amount: cashIntoPurchase });
  } else if (strategy === 'flip' || strategy === 'brrrr') {
    cashIntoPurchase = price; // cash purchase
    lines.push({ label: 'Full purchase price (cash)', amount: price });
  } else {
    cashIntoPurchase = price * (num('deposit') / 100);
    lines.push({ label: 'Deposit', amount: cashIntoPurchase });
  }

  lines.push({ label: taxName, amount: Math.round(sdlt) });
  lines.push({ label: 'Legal & survey fees', amount: legals });
  if (refurb > 0) lines.push({ label: 'Refurb budget', amount: refurb });
  // Flip carries a contingency on the refurb — part of the cash in, so show it
  // (keeps the total equal to the engine's flip cashInvested — E8.1 review #6).
  if (strategy === 'flip') {
    const contingency = Math.round(refurb * (num('contingencyPct') / 100));
    if (contingency > 0) lines.push({ label: 'Refurb contingency', amount: contingency });
  }

  if (bridging) {
    const bridgeLoanPct = num('bridgeLoanPct');
    const loan = price * (bridgeLoanPct / 100);
    const arrangement = loan * (num('arrangementPct') / 100);
    const exit = loan * (num('exitPct') / 100);
    const months = strategy === 'flip' ? num('bridgeMonths') : num('bridgeMonths');
    const interest = loan * (num('bridgeRate') / 100) * months;
    lines.push({ label: 'Bridging fees & interest', amount: Math.round(arrangement + exit + interest) });
  }

  const hasAuctionEstimate = isAuction;
  if (hasAuctionEstimate) lines.push({ label: 'Auction fees & buyer’s premium', amount: null, estimate: true });

  const total = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  return { lines, total, bridging: bridging ? { borrowed: Math.round(borrowed), cash: Math.round(cashIntoPurchase) } : undefined, hasAuctionEstimate };
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

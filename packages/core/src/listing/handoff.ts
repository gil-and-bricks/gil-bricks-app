/**
 * Analyser handoff (E6). Turns a read listing + the user's inputs into the exact
 * URL params the web analyser's own parser reads back — so "Send to my analyser"
 * round-trips every known field. Pure + shared so a test can assert the web
 * parser reads back everything the extension writes.
 */
import { strategyById } from '../strategies';
import type { StrategyId } from '../score/scoreDeal';
import type { NormalisedListing } from './types';
import type { Criteria } from './criteria';

/** Portal property type → the web analyser's D/S/T/F code (semi before detached). */
export function propertyTypeToCode(t?: string | null): '' | 'D' | 'S' | 'T' | 'F' {
  if (!t) return '';
  const s = t.toLowerCase();
  if (/semi/.test(s)) return 'S';
  if (/detached/.test(s)) return 'D';
  if (/terrac|town\s?house|end[- ]?of[- ]?terrace/.test(s)) return 'T';
  if (/flat|apartment|maisonette/.test(s)) return 'F';
  return '';
}

export interface HandoffInputs {
  strategy: StrategyId;
  /** Resolved floor area in sqm (listing / EPC / manual). */
  floorAreaSqm?: number | null;
  /** Effective strategy field values by field key (rent, gdv, arv, refurbCost,
   * rooms, roomRent, deposit, rate, …) — the unknowns + settings the panel holds. */
  fields?: Record<string, string>;
  /**
   * D4 — the MINIMUMS the person set for themselves. The panel scores against
   * them and says "you set as your minimum"; without carrying them the analyser
   * judged the same property by the strategy's defaults instead, so one click
   * changed the standard. deposit/rate already travel as ordinary fields.
   */
  criteria?: Criteria;
  /**
   * D4 — what they actually MEASURED on the floor plan. It is the only real
   * evidence anyone has about room sizes, and it used to die at the handoff.
   */
  measured?: { roomSizeFailures: number | null; roomsMeasured: number | null };
}

/** The criteria params, in one place: written here, read by the web (D4). */
export const CRITERIA_PARAMS = {
  minCashflow: 'minCashflow',
  minRoi: 'minRoi',
  minIcr: 'minIcr',
  minProfit: 'minProfit',
} as const;

/** The measurement params, likewise. */
export const MEASURED_PARAMS = { roomSizeFailures: 'roomFails', roomsMeasured: 'roomsMeasured' } as const;

/**
 * Read the criteria back out of a params string — the ONE reader, so the
 * analyser, the saved deal, the board's re-score and the re-trade radar can
 * never judge a deal by different bars (D4 review).
 *
 * Bounds are deliberately conservative: a minimum ICR of 0 is not a criterion,
 * it is a number the rental engines reject outright.
 */
export function criteriaFromParams(params: URLSearchParams): Criteria {
  const read = (key: string, min: number, max: number): number | undefined => {
    const raw = params.get(key);
    if (raw === null || raw.trim() === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
  };
  return {
    minCashflow: read(CRITERIA_PARAMS.minCashflow, 0, 100_000),
    minRoi: read(CRITERIA_PARAMS.minRoi, 0, 100),
    minIcr: read(CRITERIA_PARAMS.minIcr, 1, 10),
    minProfit: read(CRITERIA_PARAMS.minProfit, 0, 10_000_000),
  };
}

/** Write them back out, so a URL the analyser builds carries them onward. */
export function criteriaToParams(c: Criteria): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, param] of Object.entries(CRITERIA_PARAMS)) {
    const v = c[key as keyof Criteria];
    if (typeof v === 'number' && Number.isFinite(v)) out[param] = String(v);
  }
  return out;
}

/** The analyser path (e.g. "/buy-to-let/analyser") + the params to carry. */
export function buildAnalyserHandoff(listing: NormalisedListing, h: HandoffInputs): { route: string; params: Record<string, string> } {
  const cfg = strategyById(h.strategy);
  const route = `${cfg ? cfg.route : '/buy-to-let'}/analyser`;
  const params: Record<string, string> = {};
  const set = (k: string, v: unknown): void => {
    if (v === null || v === undefined) return;
    const s = String(v).trim();
    if (s !== '') params[k] = s;
  };

  // Subject fields (parsed by the web's parseQuery)
  set('postcode', listing.postcode.value);
  set('price', listing.askingPrice.value);
  set('type', propertyTypeToCode(listing.propertyType.value));
  if (h.floorAreaSqm && h.floorAreaSqm > 0) {
    set('area', String(Math.round(h.floorAreaSqm)));
    // Provenance for the floor area (E11): only claim "from the listing" when the
    // portal listing itself carried the area; otherwise it was resolved elsewhere
    // (EPC/manual/measured on the plan) and we say honestly it was carried over,
    // never presenting it as a fact off the listing.
    params.areaSrc = listing.floorAreaSqm.status === 'found' && Math.round(listing.floorAreaSqm.value ?? 0) === Math.round(h.floorAreaSqm)
      ? 'listing'
      : 'carried';
  }
  set('beds', listing.bedrooms.value);
  set('baths', listing.bathrooms.value);
  set('paon', listing.address.value?.paon);
  set('saon', listing.address.value?.saon);

  // Strategy fields (parsed by the web's initStrategyParams)
  for (const [k, v] of Object.entries(h.fields ?? {})) set(k, v);

  // D4 — the person's own minimums, so the analyser judges by the same bar the
  // panel just used. Only ones they actually set travel; an unset criterion
  // leaves the strategy's own threshold in place on both surfaces.
  for (const [key, param] of Object.entries(CRITERIA_PARAMS)) {
    const v = (h.criteria ?? {})[key as keyof Criteria];
    if (typeof v === 'number' && Number.isFinite(v)) set(param, String(v));
  }
  // D4 — and what they measured. `roomFails` is a real 0 (every room passed), so
  // it is written even when zero; `set` drops empty strings, never '0'.
  if (h.measured && h.measured.roomSizeFailures !== null && h.measured.roomSizeFailures !== undefined) {
    set(MEASURED_PARAMS.roomSizeFailures, String(h.measured.roomSizeFailures));
    if (h.measured.roomsMeasured !== null && h.measured.roomsMeasured !== undefined) {
      set(MEASURED_PARAMS.roomsMeasured, String(h.measured.roomsMeasured));
    }
  }

  // Auction marker (P4): the listing was an auction. Carried as metadata (like `src`)
  // so the analyser save can flag the deal and the board warns about the legal pack at
  // Offer in. Only ever '1' when the listing is genuinely flagged an auction.
  if (listing.isAuction.status === 'found' && listing.isAuction.value === true) params.auction = '1';

  // Arrival marker (E11): lets the web show the quiet "brought over from the
  // extension" confirmation and attribute prefilled fields to the listing. It is
  // metadata, not a field value — the web reads it once and never re-emits it.
  params.src = 'ext';

  return { route, params };
}

/** Full URL string for the handoff. */
export function buildAnalyserUrl(base: string, listing: NormalisedListing, h: HandoffInputs): string {
  const { route, params } = buildAnalyserHandoff(listing, h);
  const qs = new URLSearchParams(params).toString();
  return `${base.replace(/\/+$/, '')}${route}${qs ? `?${qs}` : ''}`;
}

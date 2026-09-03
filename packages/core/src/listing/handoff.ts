/**
 * Analyser handoff (E6). Turns a read listing + the user's inputs into the exact
 * URL params the web analyser's own parser reads back — so "Send to my analyser"
 * round-trips every known field. Pure + shared so a test can assert the web
 * parser reads back everything the extension writes.
 */
import { strategyById } from '../strategies';
import type { StrategyId } from '../score/scoreDeal';
import type { NormalisedListing } from './types';

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

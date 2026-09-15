/**
 * Analyser handoff (E6). Turns a read listing + the user's inputs into the exact
 * URL params the web analyser's own parser reads back — so "Send to my analyser"
 * round-trips every known field. Pure + shared so a test can assert the web
 * parser reads back everything the extension writes.
 */
import { strategyById } from '../strategies';
import { allFindings, findingCodes } from '../findings/findings';
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

/**
 * X1.1 — THE SUBJECT'S OWN TENURE.
 *
 * WHY IT IS NOT CALLED `tenure`. The analyser already owns a `tenure` parameter
 * and it is the COMPARABLES FILTER, whose only legal values are 'any', 'F' and
 * 'L'. Writing the subject's tenure into it would do one of two bad things:
 * `tenure=FREEHOLD` is not an allowed value, so `parseQuery` clamps it back to
 * the default and — because the key is owned by the form — it is not carried
 * through either, so it would vanish silently. And `tenure=F` would quietly
 * narrow the comparables the analyser draws on, which is a change to what the
 * engine computes, made as a side effect of a handoff.
 *
 * So it travels under its own name, as a fact about the deal rather than a
 * setting on the page — the same shape as `auction` and `areaSrc`. It is carried
 * through every edit untouched and stored with the deal.
 *
 * If the comparables filter should follow the subject's tenure, that is a
 * separate and deliberate product decision, not this parameter's job.
 */
export const SUBJECT_TENURE_PARAM = 'subjectTenure';

/**
 * X2 — THE FINDINGS, AS CODES.
 *
 * Short codes, never sentences. The wording lives in `findings/copy.ts` keyed by
 * code, so the deal's own page renders the current words rather than whatever
 * phrasing happened to be current on the day the deal was saved — and a URL
 * that has to survive a 2000-character cap does not spend 60 characters saying
 * "the listing does not give a lease length".
 *
 * They belong on the deal's own page, not on the board's card: a card is a
 * glance, and four findings on it would be four more things to read on a
 * surface whose whole job is to be scanned.
 */
export const FINDINGS_PARAM = 'finds';

/**
 * Portal tenure wording → the F/L code the rest of the app uses.
 *
 * "Share of freehold" is checked BEFORE "freehold" and resolves to LEASEHOLD,
 * because that is what it legally is: a long lease, plus a share in the company
 * that owns the freehold. Matching "freehold" first would call it freehold and
 * hide the lease — the very thing a buyer needs to ask about.
 */
export function tenureToCode(t?: string | null): '' | 'F' | 'L' {
  if (!t) return '';
  const s = t.toLowerCase();
  if (/share\s+of\s+freehold/.test(s)) return 'L';
  if (/leasehold/.test(s)) return 'L';
  if (/freehold/.test(s)) return 'F';
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

/**
 * F1 — THE FLOOR PLAN'S IMAGE URL, carried like every other field.
 *
 * The web app renders it as a backdrop with `<img src>` pointing at the
 * PORTAL'S OWN SERVER, exactly as the extension did and exactly as the listing
 * page itself does. We never fetch it, never hold its bytes and never store it:
 * what travels is an address, the same length as any other query parameter, and
 * what is kept afterwards is the user's own geometry.
 *
 * It rides in the handoff so the plan arrives with the deal at NO extra tap —
 * the whole point of the handoff is that nothing has to be done twice.
 */
export const FLOORPLAN_PARAM = 'fp';

/**
 * R3 — THE LISTING'S PHOTOS, carried the same way and for the same reason: the
 * web app renders them with `<img src>` from the PORTAL'S server, exactly as the
 * listing page does. Addresses travel; bytes never do.
 *
 * CAPPED, because a handoff is a URL. Twelve photos is more than anyone assesses
 * a refurb from, and keeps the query string comfortably inside what every
 * browser and server handles.
 */
export const PHOTOS_PARAM = 'ph';
export const MAX_HANDOFF_PHOTOS = 12;

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
  // X1.1 — the subject's own tenure, under its own name (see SUBJECT_TENURE_PARAM).
  set(SUBJECT_TENURE_PARAM, tenureToCode(listing.tenure.value));
  // X2 — what this listing said and did not say, as codes.
  set(FINDINGS_PARAM, findingCodes(allFindings(listing)));
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

  // F1 — the floor plan's address on the portal's server, if the listing had
  // one. Only ever an https URL; a blob:/data: URL would mean bytes we were
  // holding, which is the thing this product must never do with their image.
  const fp = listing.floorPlanImageUrls.status === 'found' ? listing.floorPlanImageUrls.value?.[0] : undefined;
  if (typeof fp === 'string' && /^https:\/\//i.test(fp.trim())) set(FLOORPLAN_PARAM, fp.trim());

  // R3 — the listing's own photographs, as addresses on the portal's server.
  const photos = listing.photoUrls.status === 'found' ? listing.photoUrls.value ?? [] : [];
  const usable = photos.filter((u) => typeof u === 'string' && /^https:\/\//i.test(u.trim())).slice(0, MAX_HANDOFF_PHOTOS);
  if (usable.length > 0) set(PHOTOS_PARAM, usable.join(' '));

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

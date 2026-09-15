/**
 * Zoopla extractor (E5). Primary: the App-Router `self.__next_f` flight chunks
 * (read from script tags) for the rich fields, plus `application/ld+json` for
 * the clean description/date. Fallback: ld+json + OpenGraph/meta when the flight
 * is gone. Field keys come from the remote config; the logic is here.
 */
import type { ExtractorConfig } from './config';
import { decodeZooplaFlight, getLdJson, getMeta, scriptTexts, valueAfter } from './dom';
import { parseMoney, sqftToSqm, toIsoDate } from './parse';
import {
  fieldOf,
  found,
  missing,
  unavailable,
  type ExtractResult,
  type ListingAddress,
  type ListingUpdate,
  type NormalisedListing,
} from './types';

export const ZOOPLA_EXTRACTOR_VERSION = 'zpl-1.0.0';

const MSG_CHANGED = 'We couldn’t read this Zoopla page — the site may have changed. Try refreshing; if it keeps happening we’ll need to update the reader.';
const MSG_NOT_LISTING = 'This doesn’t look like a Zoopla property listing.';

function zooplaIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = /\/(?:for-sale|to-rent|new-homes)\/details\/(\d+)/.exec(url);
  return m ? m[1] : null;
}

/** "3 bed terraced house for sale Glanmor Road, Uplands, Swansea SA2" → parts.
 * On no match returns nulls — NEVER the raw title (which would fabricate a wrong
 * address like "Property for sale in Swansea | Zoopla" on a search page). */
function parseZooplaLdName(name: string | undefined): { propertyType: string | null; address: string | null } {
  if (!name) return { propertyType: null, address: null };
  const m = /\bbed\s+(.+?)\s+for sale\s+(.+)$/i.exec(name);
  if (!m) return { propertyType: null, address: null };
  return { propertyType: m[1]?.trim() || null, address: m[2]?.trim() || null };
}

function addressFrom(displayAddress: string | undefined, paon: string | undefined, town: string | undefined): ListingAddress | null {
  if (!displayAddress && !paon && !town) return null;
  const street = displayAddress ? displayAddress.split(',')[0]?.trim() : undefined;
  const addr: ListingAddress = {};
  if (paon) addr.paon = String(paon);
  if (street) addr.street = street;
  if (town) addr.town = town;
  return Object.keys(addr).length ? addr : null;
}

/**
 * X2 — read one entry out of Zoopla's "More information" detail list.
 *
 * Those entries are objects shaped {title, value, key, description}, and the
 * KEY comes AFTER the value — so `valueAfter(flight, key)` returns the
 * description, not the figure. This finds the object by its key and reads the
 * value that belongs to it.
 *
 * The flight text holds PLAIN JSON — `"key":"council_tax_band"`, not escaped
 * quotes. It reads as escaped when you print it, because printing it escapes it;
 * matching the printed form finds nothing at all, silently, on every listing.
 *
 * Three outcomes, kept apart on purpose:
 *   undefined — no such entry on the page: this portal is not publishing it.
 *   null      — the entry is there and says "Not available": the LISTING does
 *               not give it, which is a fair thing to point out.
 *   string    — the actual value.
 */
export function zooplaDetailValue(flight: string, key: string): string | null | undefined {
  const at = flight.indexOf(`"key":"${key}"`);
  if (at < 0) return undefined;
  // Walk back to the start of this object and read its "value" member.
  const start = flight.lastIndexOf('{', at);
  if (start < 0) return undefined;
  const m = /"value":"([^"]*)"/.exec(flight.slice(start, at));
  if (!m) return null;
  const v = m[1].trim();
  if (v === '' || /^not available$/i.test(v) || /^unknown$/i.test(v)) return null;
  return v;
}

function fromEmbedded(doc: Document, flight: string, config: ExtractorConfig, url?: string): NormalisedListing {
  const p = config.zoopla.paths;
  const ld = getLdJson(doc, config.zoopla.fallback.ldType)[0] ?? {};

  const pricing = valueAfter(flight, p.pricing) as Record<string, any> | undefined;
  const counts = valueAfter(flight, p.counts) as Record<string, any> | undefined;
  const floorArea = valueAfter(flight, p.floorArea) as Record<string, any> | null | undefined;
  const floorPlan = valueAfter(flight, p.floorPlan) as Record<string, any> | undefined;
  const priceHistory = valueAfter(flight, p.priceHistory) as Record<string, any> | undefined;
  const tenure = valueAfter(flight, p.tenure);
  const propertyType = valueAfter(flight, p.propertyType);
  const listingCondition = valueAfter(flight, p.listingCondition);
  const postalCodeRaw = valueAfter(flight, p.postalCode);
  const outcode = valueAfter(flight, p.outcode);
  const incode = valueAfter(flight, p.incode);
  const publishedOn = valueAfter(flight, p.publishedOn) ?? ld.datePosted;
  const displayAddress = valueAfter(flight, p.displayAddress) as string | undefined;
  const paon = valueAfter(flight, p.propertyNumberOrName) as string | undefined;
  const town = valueAfter(flight, p.postTownName) as string | undefined;

  /**
   * X2 — WHAT ZOOPLA PUBLISHES, AND WHAT IT SIMPLY DOES NOT.
   *
   * Zoopla's model carries an `epc` object and a council-tax entry in its detail
   * list. It carries NOTHING for lease length, ground rent or service charge —
   * not an empty field, no field at all. So those three are `unavailable` here
   * and can never raise a chip: telling somebody a lease has no ground rent
   * because Zoopla does not publish ground rent would be inventing a fact about
   * their lease out of our own blind spot.
   *
   * Council tax is the interesting one. Zoopla prints the words "Not available"
   * as the VALUE when an agent has not supplied a band — which is the listing
   * saying it does not know, not the portal failing to publish. That is exactly
   * `missing`, and it is read as such.
   */
  const epcObj = valueAfter(flight, p.epc) as Record<string, unknown> | null | undefined;
  const hasEpcField = epcObj !== undefined;
  const epcUrls = epcObj && typeof epcObj === 'object'
    ? Object.values(epcObj).filter((v): v is string => typeof v === 'string' && /^https?:\/\//i.test(v))
    : [];
  const ctBandRaw = zooplaDetailValue(flight, p.councilTaxBandKey);

  const postcode =
    typeof postalCodeRaw === 'string' && postalCodeRaw
      ? postalCodeRaw
      : typeof outcode === 'string' && typeof incode === 'string'
        ? `${outcode} ${incode}`
        : null;

  const pageUrl = url ?? (typeof ld.mainEntityOfPage === 'string' ? ld.mainEntityOfPage : undefined) ?? getMeta(doc, config.zoopla.fallback.meta.url);
  const listingId = zooplaIdFromUrl(pageUrl) ?? (valueAfter(flight, p.listingId) != null ? String(valueAfter(flight, p.listingId)) : null);

  /**
   * R3 — Zoopla's own photographs.
   *
   * Zoopla gives FILENAMES, not URLs — the same shape it already gives for
   * floor plans. The page itself serves them from `lid.zoocdn.com/u/<w>/<h>/`,
   * which is visible in the page's own preload link, so the prefix is READ FROM
   * THE PAGE rather than assumed: if Zoopla ever moves its CDN, the page moves
   * with it and this follows. Where the page shows no such link we fall back to
   * the size it was last seen using, and if that is ever wrong the result is a
   * photo that does not load — which the carousel already handles honestly.
   */
  const imagesRaw = valueAfter(flight, 'propertyImage') as Array<{ filename?: string }> | undefined;
  /**
   * The prefix is READ FROM THE PAGE and nowhere else. There is deliberately NO
   * hardcoded fallback: writing one would be guessing at somebody else's CDN
   * layout, and a guess that goes stale shows broken photos rather than none.
   * If the page does not show us where it serves its own images from, we carry
   * no photos for that listing and say so — which is also why this file names
   * no external host, as the extension's output guard requires.
   */
  let zoocdnPrefix: string | null = null;
  try {
    const head = doc.head?.innerHTML ?? '';
    const seen = /https:\/\/li[a-z]\.zoocdn\.com\/u\/\d+\/\d+\//i.exec(head);
    if (seen) [zoocdnPrefix] = seen;
  } catch {
    zoocdnPrefix = null;
  }
  /**
   * Filenames to addresses, ONE way, for photographs and floor plans alike.
   *
   * This existed only for the photographs. Floor plans took the same
   * `{ filename }` shape straight out of the page and were handed on as
   * `f0fc15a5….jpg` — a bare filename, not an address. `handoff.ts` then
   * dropped it, because it only carries an `fp` that is an https URL, so NO
   * Zoopla listing had ever handed a floor plan to the analyser. Worse, the
   * panel offered its measure tool over that filename, so the one surface where
   * you would notice showed an image that could never load.
   *
   * Two call sites reading the same page the same way had drifted apart, which
   * is why they are now one function.
   */
  const toUrls = (filenames: unknown): string[] => (Array.isArray(filenames)
    ? filenames
      .map((f) => (typeof f === 'string' ? f : ''))
      .filter((f) => f !== '')
      .map((f) => (/^https:\/\//i.test(f) ? f : (zoocdnPrefix === null ? '' : `${zoocdnPrefix}${f}`)))
      .filter((u) => /^https:\/\//i.test(u))
    : []);

  const zooplaPhotos = toUrls(Array.isArray(imagesRaw) ? imagesRaw.map((i) => i?.filename) : []);

  const fpFilenames = toUrls(Array.isArray(floorPlan?.image)
    ? floorPlan!.image.map((im: any) => im?.filename)
    : []);

  // Zoopla exposes a machine "publishedOn" (first live) but no update REASON
  // unless priceHistory.priceChanges is populated. A price change can be a rise
  // OR a cut, so read the DIRECTION and never label a rise (or an unknown) as a
  // reduction — otherwise a downstream reader would fabricate a false "Reduced".
  let update: ListingUpdate | null = null;
  const changes = priceHistory?.priceChanges;
  if (Array.isArray(changes) && changes.length > 0) {
    const latest = changes[changes.length - 1];
    const d = toIsoDate(latest?.date);
    if (d) {
      const priceOf = (c: any): number | null => parseMoney(c?.price ?? c?.priceLabel ?? c?.value ?? c?.amount);
      const curr = priceOf(latest);
      const prev = changes.length > 1 ? priceOf(changes[changes.length - 2]) : null;
      const reason = curr != null && prev != null ? (curr < prev ? 'reduced' : curr > prev ? 'increased' : 'changed') : 'changed';
      update = { reason, date: d };
    }
  }

  return {
    portal: 'zoopla',
    extractorVersion: ZOOPLA_EXTRACTOR_VERSION,
    configVersion: config.configVersion,
    source: 'embedded',
    listingId: fieldOf(listingId),
    url: fieldOf(pageUrl ?? null),
    postcode: fieldOf(postcode),
    outcode: fieldOf(typeof outcode === 'string' ? outcode : null),
    address: fieldOf(addressFrom(displayAddress, paon, town)),
    askingPrice: fieldOf(parseMoney(pricing?.internalValue ?? pricing?.label)),
    propertyType: fieldOf(typeof propertyType === 'string' ? propertyType : null),
    tenure: fieldOf(typeof tenure === 'string' ? tenure : null),
    bedrooms: fieldOf(typeof counts?.numBedrooms === 'number' ? counts.numBedrooms : null),
    bathrooms: fieldOf(typeof counts?.numBathrooms === 'number' ? counts.numBathrooms : null),
    floorAreaSqm: fieldOf(floorArea && typeof floorArea.value === 'number' ? sqftToSqm(floorArea.value) : null),
    floorAreaSqmRange: missing<{ minSqm: number; maxSqm: number }>(),
    // Zoopla gives floor-plan image FILENAMES (not absolute URLs) in the flight.
    floorPlanImageUrls: fieldOf(fpFilenames),
    photoUrls: fieldOf(zooplaPhotos),
    newBuild: typeof listingCondition === 'string' ? found(listingCondition === 'new') : missing<boolean>(),
    listingUpdate: fieldOf(update),
    firstVisibleDate: fieldOf(typeof publishedOn === 'string' ? toIsoDate(publishedOn) ?? publishedOn : null),
    description: fieldOf(typeof ld.description === 'string' ? ld.description : null),
    isAuction: typeof pricing?.isAuction === 'boolean' ? found(pricing.isAuction) : missing<boolean>(),

    // X2 — see the note above. Two Zoopla publishes, three it does not.
    epcUrls: hasEpcField ? found(epcUrls) : unavailable<string[]>(),
    councilTaxBand: ctBandRaw === undefined
      ? unavailable<string>()
      : (ctBandRaw === null ? missing<string>() : found(ctBandRaw)),
    leaseYearsRemaining: unavailable<number>(),
    annualGroundRent: unavailable<number>(),
    annualServiceCharge: unavailable<number>(),
  };
}

function fromFallback(doc: Document, config: ExtractorConfig, url?: string): NormalisedListing | null {
  const meta = config.zoopla.fallback.meta;
  const ld = getLdJson(doc, config.zoopla.fallback.ldType)[0] ?? {};
  const pageUrl = url ?? (typeof ld.mainEntityOfPage === 'string' ? ld.mainEntityOfPage : undefined) ?? getMeta(doc, meta.url);
  const listingId = zooplaIdFromUrl(pageUrl);
  const nameParsed = parseZooplaLdName(typeof ld.name === 'string' ? ld.name : getMeta(doc, meta.title));
  const description = typeof ld.description === 'string' ? ld.description : getMeta(doc, meta.description);
  // Must be a listing DETAIL page (id from a /details/ URL) AND carry a
  // listing-shaped field — a generic marketing og:description on a home/search
  // page is NOT a listing (would otherwise be a hollow/wrong "read").
  if (!listingId || (!nameParsed.propertyType && !nameParsed.address)) return null;

  const beds = Array.isArray(ld.additionalProperty)
    ? Number(ld.additionalProperty.find((a: any) => a?.name === 'Bedrooms')?.value)
    : NaN;
  const baths = Array.isArray(ld.additionalProperty)
    ? Number(ld.additionalProperty.find((a: any) => a?.name === 'Bathrooms')?.value)
    : NaN;

  return {
    portal: 'zoopla',
    extractorVersion: ZOOPLA_EXTRACTOR_VERSION,
    configVersion: config.configVersion,
    source: 'dom',
    listingId: fieldOf(listingId),
    url: fieldOf(pageUrl ?? null),
    postcode: missing<string>(),
    outcode: missing<string>(),
    address: fieldOf(nameParsed.address ? { street: nameParsed.address.split(',')[0]?.trim() } : null),
    askingPrice: missing<number>(),
    propertyType: fieldOf(nameParsed.propertyType),
    tenure: missing<string>(),
    bedrooms: fieldOf(Number.isFinite(beds) ? beds : null),
    bathrooms: fieldOf(Number.isFinite(baths) ? baths : null),
    floorAreaSqm: missing<number>(),
    floorAreaSqmRange: missing<{ minSqm: number; maxSqm: number }>(),
    floorPlanImageUrls: missing<string[]>(),
    photoUrls: missing<string[]>(),
    newBuild: missing<boolean>(),
    listingUpdate: missing(),
    firstVisibleDate: fieldOf(typeof ld.datePosted === 'string' ? toIsoDate(ld.datePosted) ?? ld.datePosted : null),
    description: fieldOf(description),
    isAuction: unavailable<boolean>(),
    // The fallback path never read the flight model, so it knows nothing about
    // any of these — `missing` would blame the agent for our own parse failure.
    epcUrls: unavailable<string[]>(),
    councilTaxBand: unavailable<string>(),
    leaseYearsRemaining: unavailable<number>(),
    annualGroundRent: unavailable<number>(),
    annualServiceCharge: unavailable<number>(),
  };
}

export function extractZoopla(doc: Document, config: ExtractorConfig, url?: string): ExtractResult {
  if (!config.flags.zooplaEnabled) return { ok: false, portal: 'zoopla', reason: 'not-a-listing', message: MSG_NOT_LISTING };
  const flight = decodeZooplaFlight(doc);
  const hadFlight = scriptTexts(doc).some((t) => t.includes('__next_f'));
  const pageUrl = url ?? (typeof (getLdJson(doc, config.zoopla.fallback.ldType)[0]?.mainEntityOfPage) === 'string' ? getLdJson(doc, config.zoopla.fallback.ldType)[0].mainEntityOfPage : undefined) ?? getMeta(doc, config.zoopla.fallback.meta.url) ?? undefined;
  const isDetail = !!zooplaIdFromUrl(pageUrl);

  // "embedded" is viable only on a listing DETAIL page whose flight carries the
  // model — a stray "pricing" key on a search/home page must NOT qualify.
  if (isDetail && flight && valueAfter(flight, config.zoopla.paths.pricing) !== undefined) {
    return { ok: true, listing: fromEmbedded(doc, flight, config, pageUrl) };
  }

  if (config.flags.domFallbackEnabled) {
    const fb = fromFallback(doc, config, pageUrl);
    if (fb) return { ok: true, listing: fb };
  }

  const looksZoopla = hadFlight || getLdJson(doc, config.zoopla.fallback.ldType).length > 0 || !!getMeta(doc, config.zoopla.fallback.meta.title) || (pageUrl?.includes('zoopla.co.uk') ?? false);
  if (!looksZoopla) return { ok: false, portal: 'zoopla', reason: 'not-a-listing', message: MSG_NOT_LISTING };
  return { ok: false, portal: 'zoopla', reason: hadFlight ? 'shape-changed' : 'no-blob', message: MSG_CHANGED };
}

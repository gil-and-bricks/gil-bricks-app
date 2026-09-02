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

  const postcode =
    typeof postalCodeRaw === 'string' && postalCodeRaw
      ? postalCodeRaw
      : typeof outcode === 'string' && typeof incode === 'string'
        ? `${outcode} ${incode}`
        : null;

  const pageUrl = url ?? (typeof ld.mainEntityOfPage === 'string' ? ld.mainEntityOfPage : undefined) ?? getMeta(doc, config.zoopla.fallback.meta.url);
  const listingId = zooplaIdFromUrl(pageUrl) ?? (valueAfter(flight, p.listingId) != null ? String(valueAfter(flight, p.listingId)) : null);

  const fpFilenames = Array.isArray(floorPlan?.image)
    ? floorPlan!.image.map((im: any) => im?.filename).filter((f: unknown): f is string => typeof f === 'string')
    : [];

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
    newBuild: typeof listingCondition === 'string' ? found(listingCondition === 'new') : missing<boolean>(),
    listingUpdate: fieldOf(update),
    firstVisibleDate: fieldOf(typeof publishedOn === 'string' ? toIsoDate(publishedOn) ?? publishedOn : null),
    description: fieldOf(typeof ld.description === 'string' ? ld.description : null),
    isAuction: typeof pricing?.isAuction === 'boolean' ? found(pricing.isAuction) : missing<boolean>(),
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
    newBuild: missing<boolean>(),
    listingUpdate: missing(),
    firstVisibleDate: fieldOf(typeof ld.datePosted === 'string' ? toIsoDate(ld.datePosted) ?? ld.datePosted : null),
    description: fieldOf(description),
    isAuction: unavailable<boolean>(),
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

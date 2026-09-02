/**
 * Rightmove extractor (E5). Primary: window.__PAGE_MODEL (flatted) read from the
 * page's script tags. Fallback: OpenGraph/meta tags (Rightmove ships no
 * ld+json). Field paths come from the remote config; the parsing logic is here.
 */
import type { ExtractorConfig } from './config';
import { getMeta, getRightmovePageModel, scriptTexts } from './dom';
import { getPath } from './path';
import { parseListingUpdate, parseMoney, parseRightmoveOgTitle, rightmoveFloorArea, rightmoveIdFromUrl } from './parse';
import {
  fieldOf,
  found,
  missing,
  unavailable,
  type ExtractResult,
  type Field,
  type ListingAddress,
  type NormalisedListing,
} from './types';

export const RIGHTMOVE_EXTRACTOR_VERSION = 'rm-1.0.0';

const MSG_CHANGED = 'We couldn’t read this Rightmove page — the site may have changed. Try refreshing; if it keeps happening we’ll need to update the reader.';
const MSG_NOT_LISTING = 'This doesn’t look like a Rightmove property listing.';

const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/i;

/**
 * Rightmove exposes only a single joined displayAddress (no house-number field),
 * so parse it into Land-Registry shape — paon (house number, optional letter),
 * saon (Flat/Apartment/Unit), street, town — so the EPC-from-sector floor-area
 * lookup can actually match (E8.1). A number can't always be recovered (many
 * Rightmove addresses are street-only); leaving paon undefined then is correct —
 * a per-address EPC match is impossible and the fallback returns null.
 */
function splitAddress(display: string | undefined): ListingAddress | null {
  if (!display || !display.trim()) return null;
  const parts = display.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  let saon: string | undefined;
  let idx = 0;
  // A leading "Flat 2" / "Apartment 5" / "Unit 3B" is the secondary address.
  if (/^(flat|apartment|apt|unit)\b/i.test(parts[0])) {
    saon = parts[0];
    idx = 1;
  }

  // The next segment carries the house number (paon) + street, e.g. "8 Tyfica Road".
  const head = parts[idx] ?? '';
  let paon: string | undefined;
  let street: string | undefined;
  const m = /^(\d+[a-z]?)\s+(.*)$/i.exec(head);
  if (m) {
    paon = m[1];
    street = m[2];
  } else {
    street = head || undefined;
  }

  // Town = the last comma part that isn't the street segment or a postcode.
  let town: string | undefined;
  for (let i = parts.length - 1; i > idx; i--) {
    if (!POSTCODE_RE.test(parts[i])) { town = parts[i]; break; }
  }

  return { paon, saon, street, town };
}

function fromEmbedded(pd: Record<string, unknown>, config: ExtractorConfig, url?: string): NormalisedListing {
  const p = config.rightmove.paths;
  const outcode = getPath(pd, p.outcode) as string | undefined;
  const incode = getPath(pd, p.incode) as string | undefined;
  const postcode = outcode && incode ? `${outcode} ${incode}` : null;

  const floorplans = getPath(pd, p.floorplans) as Array<{ url?: string }> | undefined;
  const fpUrls = Array.isArray(floorplans) ? floorplans.map((f) => f?.url).filter((u): u is string => !!u) : [];
  const fa = rightmoveFloorArea(getPath(pd, p.sizings));

  const update = parseListingUpdate(getPath(pd, p.listingUpdateReason));
  const channelRaw = getPath(pd, p.channel);
  const channel = String(channelRaw ?? '');
  const tags = getPath(pd, p.tags);
  const newBuildSignal = channelRaw != null || Array.isArray(tags);
  const isNew = channel.toUpperCase().includes('NEW') || (Array.isArray(tags) && tags.some((t) => /new[ _-]?home|new[ _-]?build/i.test(String(t))));
  const auctionRaw = getPath(pd, p.auction);

  return {
    portal: 'rightmove',
    extractorVersion: RIGHTMOVE_EXTRACTOR_VERSION,
    configVersion: config.configVersion,
    source: 'embedded',
    listingId: fieldOf(getPath(pd, p.listingId) != null ? String(getPath(pd, p.listingId)) : null),
    url: fieldOf(url ?? null),
    postcode: fieldOf(postcode),
    outcode: fieldOf(outcode ?? null),
    address: fieldOf(splitAddress(getPath(pd, p.displayAddress) as string | undefined)),
    askingPrice: fieldOf(parseMoney(getPath(pd, p.price))),
    propertyType: fieldOf(getPath(pd, p.propertyType) as string | undefined),
    tenure: fieldOf(getPath(pd, p.tenure) as string | undefined),
    bedrooms: fieldOf(typeof getPath(pd, p.bedrooms) === 'number' ? (getPath(pd, p.bedrooms) as number) : null),
    bathrooms: fieldOf(typeof getPath(pd, p.bathrooms) === 'number' ? (getPath(pd, p.bathrooms) as number) : null),
    floorAreaSqm: fieldOf(fa?.midSqm ?? null),
    floorAreaSqmRange: fa?.isRange ? found({ minSqm: fa.minSqm, maxSqm: fa.maxSqm }) : missing<{ minSqm: number; maxSqm: number }>(),
    floorPlanImageUrls: fieldOf(fpUrls),
    newBuild: newBuildSignal ? found(isNew) : missing<boolean>(),
    listingUpdate: fieldOf(update),
    // Rightmove records first-live only via an "Added on" reason; a "Reduced"
    // listing's original go-live date isn't in the model.
    firstVisibleDate: update?.reason === 'added' ? found(update.date) : missing<string>(),
    description: fieldOf(getPath(pd, p.description) as string | undefined),
    // Rightmove has no reliable structured auction flag unless present.
    isAuction: typeof auctionRaw === 'boolean' ? found(auctionRaw) : unavailable<boolean>(),
  };
}

function fromFallback(doc: Document, config: ExtractorConfig, url?: string): NormalisedListing | null {
  const meta = config.rightmove.fallback.meta;
  const title = getMeta(doc, meta.title);
  const ogUrl = url ?? getMeta(doc, meta.url);
  const parsed = parseRightmoveOgTitle(title);
  const listingId = rightmoveIdFromUrl(ogUrl);
  const description = getMeta(doc, meta.description);
  // Must be a listing DETAIL page (id from a /properties/ URL) AND carry a
  // listing-shaped field. A generic marketing og:description on a home/search
  // page is NOT a listing — never return a hollow/wrong "read".
  if (!listingId || (!parsed.propertyType && !parsed.address)) return null;

  const na = <T>(): Field<T> => unavailable<T>();
  return {
    portal: 'rightmove',
    extractorVersion: RIGHTMOVE_EXTRACTOR_VERSION,
    configVersion: config.configVersion,
    source: 'dom',
    listingId: fieldOf(listingId),
    url: fieldOf(ogUrl ?? null),
    postcode: missing<string>(),
    outcode: missing<string>(),
    address: fieldOf(parsed.address ? splitAddress(parsed.address) : null),
    askingPrice: missing<number>(), // not in og for Rightmove
    propertyType: fieldOf(parsed.propertyType),
    tenure: missing<string>(),
    bedrooms: fieldOf(parsed.bedrooms),
    bathrooms: missing<number>(),
    floorAreaSqm: missing<number>(),
    floorAreaSqmRange: missing<{ minSqm: number; maxSqm: number }>(),
    floorPlanImageUrls: missing<string[]>(),
    newBuild: missing<boolean>(),
    listingUpdate: missing(),
    firstVisibleDate: missing<string>(),
    description: fieldOf(description),
    isAuction: na<boolean>(),
  };
}

export function extractRightmove(doc: Document, config: ExtractorConfig, url?: string): ExtractResult {
  if (!config.flags.rightmoveEnabled) return { ok: false, portal: 'rightmove', reason: 'not-a-listing', message: MSG_NOT_LISTING };
  const pageUrl = url ?? getMeta(doc, config.rightmove.fallback.meta.url) ?? undefined;
  const hadBlob = scriptTexts(doc).some((t) => t.includes('window.__PAGE_MODEL'));

  const pd = getRightmovePageModel(doc);
  if (pd) return { ok: true, listing: fromEmbedded(pd, config, pageUrl) };

  if (config.flags.domFallbackEnabled) {
    const fb = fromFallback(doc, config, pageUrl);
    if (fb) return { ok: true, listing: fb };
  }

  const looksRightmove = hadBlob || !!getMeta(doc, config.rightmove.fallback.meta.title) || (pageUrl?.includes('rightmove.co.uk') ?? false);
  if (!looksRightmove) return { ok: false, portal: 'rightmove', reason: 'not-a-listing', message: MSG_NOT_LISTING };
  return { ok: false, portal: 'rightmove', reason: hadBlob ? 'shape-changed' : 'no-blob', message: MSG_CHANGED };
}

/**
 * Extractor dispatcher (E5). Picks the portal extractor, runs it inside a guard
 * so an unexpected error becomes a typed 'unreadable' failure the UI can explain
 * — never a throw and never a wrong value.
 */
import type { ExtractorConfig } from './config';
import { extractRightmove } from './rightmove';
import { extractZoopla } from './zoopla';
import type { ExtractResult, Portal } from './types';

const MSG_UNREADABLE = 'We couldn’t read this page — something unexpected got in the way. Try refreshing.';

/** Which portal a URL/host belongs to, or null. */
export function portalForUrl(url: string | null | undefined): Portal | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === 'rightmove.co.uk' || host.endsWith('.rightmove.co.uk')) return 'rightmove';
  if (host === 'zoopla.co.uk' || host.endsWith('.zoopla.co.uk')) return 'zoopla';
  return null;
}

/**
 * Is this URL a FOR-SALE listing detail page (not a search, not a home page,
 * not a rental)? Used to badge the toolbar icon and to offer the in-page opener
 * ONLY where there is something to analyse. Every strategy in this product buys
 * a property, so a to-rent page is not a deal — offering to analyse one would
 * read a monthly rent as an asking price. Pure and shared, so the extension's
 * gating and the extractors agree on what "a listing" means.
 */
export function isListingUrl(url: string | null | undefined): boolean {
  const portal = portalForUrl(url);
  if (!portal || !url) return false;
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return '';
    }
  })();
  if (/property-to-rent|\/to-rent\//.test(path)) return false;
  return portal === 'rightmove'
    ? /\/properties\/\d+/.test(path) || /property-\d+\.html/.test(path)
    : /\/(?:for-sale|new-homes)\/details\/\d+/.test(path);
}

export function extractListing(portal: Portal, doc: Document, config: ExtractorConfig, url?: string): ExtractResult {
  try {
    return portal === 'rightmove' ? extractRightmove(doc, config, url) : extractZoopla(doc, config, url);
  } catch {
    return { ok: false, portal, reason: 'unreadable', message: MSG_UNREADABLE };
  }
}

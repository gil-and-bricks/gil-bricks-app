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

export function extractListing(portal: Portal, doc: Document, config: ExtractorConfig, url?: string): ExtractResult {
  try {
    return portal === 'rightmove' ? extractRightmove(doc, config, url) : extractZoopla(doc, config, url);
  } catch {
    return { ok: false, portal, reason: 'unreadable', message: MSG_UNREADABLE };
  }
}

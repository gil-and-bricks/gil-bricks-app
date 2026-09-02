/**
 * Thin content-script adapter (E5). It hands the extractor the page the user has
 * personally opened — read from `document` in the ISOLATED world (script tags),
 * never fetched, never injected into the main world, never transmitted anywhere.
 *
 * - extractCurrentPage(): content-script side. Reads the cached/shipped config
 *   (NO network from the page) and extracts the live document.
 * - refreshRemoteConfig(): panel side. Best-effort refresh of the cached config
 *   from R2 (CORS; falls back silently). Never blocks the UI.
 */
import { extractListing, loadExtractorConfig, portalForUrl, type ExtractResult } from '@gil-bricks/core';
import { chromeConfigStore } from './configStore';

export const EXTRACT_MESSAGE = 'gb:extract' as const;

export async function extractCurrentPage(): Promise<ExtractResult> {
  const url = location.href;
  const portal = portalForUrl(url);
  if (!portal) {
    return { ok: false, portal: null, reason: 'not-a-listing', message: 'This isn’t a Rightmove or Zoopla page.' };
  }
  // cache-or-shipped config only — the content script makes NO network request
  const { config } = await loadExtractorConfig({ store: chromeConfigStore, disableRemote: true });
  return extractListing(portal, document, config, url);
}

/** Panel-side: pull the latest config from R2 into the cache (best-effort).
 * forceRemote bypasses the cache so it actually re-fetches each panel open;
 * on failure the existing cache/shipped fallback is left in place. */
export async function refreshRemoteConfig(): Promise<void> {
  try {
    await loadExtractorConfig({ fetchImpl: fetch, store: chromeConfigStore, forceRemote: true });
  } catch {
    /* offline / blocked — the shipped fallback is already in effect */
  }
}

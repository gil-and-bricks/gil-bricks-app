/**
 * What the toolbar and the panel do per tab (D1) — kept out of the service
 * worker entry point so it can be tested against a fake `chrome` instead of a
 * real browser.
 *
 * THE RULE WE ARE WORKING INSIDE: Chrome will not open a side panel on page
 * load. `chrome.sidePanel.open()` "may only be called in response to a user
 * action" — an action-icon click, a keyboard shortcut, a context-menu choice,
 * or a gesture on an extension page or a content script. So:
 *   - on a LISTING page we badge the icon and say what a click does;
 *   - the content script's own button forwards its click here, which is the one
 *     gesture the API accepts from a page.
 */
import { isListingUrl } from '@gil-bricks/core';
import { isSupportedUrl } from './supported';

export const BADGE = {
  text: '•',
  /** The default tooltip, restored when a tab leaves a listing. */
  idle: '',
  background: '#dcff00',
  /** Near-black on lime — never white on lime (brand rule). */
  textColour: '#070014',
  onListing: 'Deal found — click to analyse this listing',
} as const;

/** The slice of the chrome API this module uses. */
export interface ChromeLike {
  action: {
    setBadgeText: (d: { tabId?: number; text: string | null }) => Promise<void>;
    setBadgeBackgroundColor: (d: { color: string }) => Promise<void>;
    setBadgeTextColor?: (d: { color: string }) => Promise<void>;
    setTitle: (d: { tabId?: number; title: string }) => Promise<void>;
  };
  sidePanel: {
    setOptions: (d: { tabId?: number; path?: string; enabled: boolean }) => Promise<void>;
    open: (d: { tabId: number }) => Promise<void>;
  };
}

/** Paint the badge once, at worker start. */
export function paintBadgeStyle(api: ChromeLike): void {
  void api.action.setBadgeBackgroundColor({ color: BADGE.background }).catch(() => undefined);
  void api.action.setBadgeTextColor?.({ color: BADGE.textColour }).catch(() => undefined);
}

/**
 * One tab's state: the panel is available on the two portals, and the icon
 * wears a dot only where there is a listing to read.
 */
export function applyTab(api: ChromeLike, tabId: number, url?: string, idleTitle: string = BADGE.idle): void {
  void api.sidePanel
    .setOptions({ tabId, path: 'sidepanel.html', enabled: isSupportedUrl(url) })
    .catch((e) => console.error('[gil&bricks] setOptions failed', e));
  const listing = isListingUrl(url);
  // On a listing the dot wins — here, a click reads the page. Everywhere else the
  // per-tab badge is CLEARED (null, not ''), so the global attention count shows
  // through: an empty string would be a per-tab override that hides it (P10).
  void api.action.setBadgeText({ tabId, text: listing ? BADGE.text : null }).catch(() => undefined);
  // The tooltip must be cleared as well as set: leaving a listing (the back
  // button, a search) otherwise kept "Deal found" on a tab with no deal. Off a
  // listing it falls back to whatever the attention badge is saying (P10).
  void api.action.setTitle({ tabId, title: listing ? BADGE.onListing : idleTitle }).catch(() => undefined);
}

/**
 * The in-page button's click, forwarded by the content script. Returns whether
 * Chrome actually opened the panel, so the page can say what to do instead
 * rather than sitting there looking dead.
 */
export async function openPanelFor(api: ChromeLike, tabId: number | undefined): Promise<{ opened: boolean }> {
  if (typeof tabId !== 'number') return { opened: false };
  try {
    await api.sidePanel.open({ tabId });
    return { opened: true };
  } catch {
    return { opened: false };
  }
}

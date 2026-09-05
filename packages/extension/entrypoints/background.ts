import { defineBackground } from '#imports';
import { OPEN_PANEL_MESSAGE } from '../src/opener';
import { applyTab, openPanelFor, paintBadgeStyle, type ChromeLike } from '../src/panelState';

/**
 * Background service worker (MV3, module).
 *
 * - The panel opens ONLY on a user gesture: the toolbar icon (openPanelOnActionClick)
 *   or the content script's own in-page button, whose click is forwarded here.
 *   Chrome permits no third way — a panel cannot open on page load (D1).
 * - On a LISTING page the toolbar icon wears a lime dot and says what a click
 *   will do, which is the loudest signal Chrome allows without a gesture.
 * - The panel is ENABLED only on Rightmove/Zoopla tabs and DISABLED everywhere
 *   else. Because we hold no "tabs" permission, tab.url is populated only for
 *   tabs we have host access to (the two portals), so unsupported tabs resolve
 *   to url === undefined → disabled. isSupportedUrl double-checks the host.
 */
// type: 'module' → an ES-module service worker (spec), so later sprints can use
// imports in the background without a manifest/CSP change.
export default defineBackground({
  type: 'module',
  main() {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((e) => console.error('[gil&bricks] setPanelBehavior failed', e));

    // Baseline: DISABLED everywhere. The manifest's default_path would otherwise
    // leave the panel enabled-by-default on any tab we never got an event for
    // (e.g. the tab already active at install / service-worker cold-start), which
    // would let the toolbar click open it on a non-portal page. Portals are
    // re-enabled per-tab below.
    chrome.sidePanel
      .setOptions({ enabled: false })
      .catch((e) => console.error('[gil&bricks] baseline setOptions failed', e));

    const api = chrome as unknown as ChromeLike;
    // The badge is the "we can read this page" signal. Colours set once.
    paintBadgeStyle(api);

    const apply = (tabId: number, url?: string): void => applyTab(api, tabId, url);

    // The one legal route to opening the panel from the page: the person clicks
    // OUR button in the page, the content script forwards that gesture here, and
    // we open the panel for that tab. Chrome refuses if the gesture did not
    // survive the hop; the page says what to do instead rather than sit dead.
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || msg.type !== OPEN_PANEL_MESSAGE) return false;
      void openPanelFor(api, sender.tab?.id).then(sendResponse);
      return true; // async reply
    });

    // Sweep already-open tabs at install and browser start so the currently
    // active tab is gated immediately (no "tabs" permission needed: query returns
    // tab.url only for host-matched portal tabs — exactly the gating input).
    const sweep = (): void => {
      chrome.tabs
        .query({})
        .then((tabs) => { for (const t of tabs) if (typeof t.id === 'number') apply(t.id, t.url); })
        .catch((e) => console.error('[gil&bricks] sweep failed', e));
    };
    chrome.runtime.onInstalled.addListener(sweep);
    chrome.runtime.onStartup.addListener(sweep);
    // main() runs on EVERY service-worker wake (not just install/startup), and
    // onInstalled/onStartup do NOT fire on a cold-start-from-idle. Without this
    // immediate sweep, a portal tab that was already active when the worker slept
    // has no per-tab enable, so it falls back to the global enabled:false and the
    // toolbar click opens the panel MENU instead of the panel. Sweeping here
    // re-enables the current portal tab so the icon opens the panel directly (E10).
    sweep();

    chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
      // React when the page settles or navigates (url only present on portal tabs).
      if (info.status === 'complete' || typeof info.url === 'string') apply(tabId, tab.url);
    });

    chrome.tabs.onActivated.addListener(({ tabId }) => {
      chrome.tabs.get(tabId).then((tab) => apply(tabId, tab.url)).catch(() => apply(tabId, undefined));
    });
  },
});

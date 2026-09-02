import { defineBackground } from '#imports';
import { isSupportedUrl } from '../src/supported';

/**
 * Background service worker (MV3, module).
 *
 * - The panel opens ONLY on a user gesture (the toolbar icon) — we set
 *   openPanelOnActionClick and never call sidePanel.open() ourselves.
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

    const apply = (tabId: number, url?: string): void => {
      chrome.sidePanel
        .setOptions({ tabId, path: 'sidepanel.html', enabled: isSupportedUrl(url) })
        .catch((e) => console.error('[gil&bricks] setOptions failed', e));
    };

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

    chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
      // React when the page settles or navigates (url only present on portal tabs).
      if (info.status === 'complete' || typeof info.url === 'string') apply(tabId, tab.url);
    });

    chrome.tabs.onActivated.addListener(({ tabId }) => {
      chrome.tabs.get(tabId).then((tab) => apply(tabId, tab.url)).catch(() => apply(tabId, undefined));
    });
  },
});

import { defineBackground } from '#imports';
import { coreConfig } from '@gil-bricks/core';
import { OPEN_PANEL_MESSAGE } from '../src/opener';
import { applyTab, openPanelFor, paintBadgeStyle, type ChromeLike } from '../src/panelState';
import { ATTENTION, nextRun, refreshAttention } from '../src/attention';
import * as store from '../src/store';

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
 * - ONCE A DAY (P10) an alarm wakes this worker, asks the web app what needs the
 *   person, and wears the answer as a count on the toolbar. MV3 workers sleep, so
 *   the alarm is re-asserted on install AND on startup AND on every wake — an
 *   alarm that was never re-created is an alarm that never fires again.
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

    /**
     * P10 — what the toolbar says away from a listing: the attention count's
     * tooltip, or the extension's own name. Read from the manifest (synchronously,
     * so it is never briefly blank), and kept here so a tab update does not have
     * to re-ask.
     */
    const defaultTitle = chrome.runtime.getManifest().action?.default_title ?? '';
    let idleTitle = defaultTitle;
    /** The worker's own memory of what it has already said, backing up storage. */
    let saidToday = '';
    const saidAbout = new Set<string>();
    const apply = (tabId: number, url?: string): void => applyTab(api, tabId, url, idleTitle);

    /**
     * The daily ask. Every chrome call it makes is passed in, so the whole
     * decision lives in src/attention.ts and is tested without a browser.
     */
    const checkAttention = async (): Promise<void> => {
      const out = await refreshAttention({
        fetch: (url, init) => fetch(url, init as RequestInit),
        // No tabId: this is the GLOBAL badge, which a listing tab's own dot
        // overrides while you are on it.
        setBadge: (text) => chrome.action.setBadgeText({ text }),
        // The tooltip is set GLOBALLY as well as remembered: without this it
        // would only change the next time some tab fired an event (P10 review).
        setTitle: (title) => {
          idleTitle = title === '' ? defaultTitle : title;
          return chrome.action.setTitle({ title: idleTitle });
        },
        notify: ({ title, message }) => new Promise((resolve) => {
          chrome.notifications.create(ATTENTION.alarm, {
            type: 'basic', iconUrl: 'icon/128.png', title, message, priority: 0,
          }, () => resolve());
        }),
        remindersOn: () => store.getReminders(),
        // Storage can refuse a write (a blocked profile), which would let the
        // guard fail OPEN and notify twice. The worker's own memory backs it up
        // for as long as it is alive (P10 review).
        lastNotified: async () => saidToday || (await store.getLastNotified()),
        notifiedKeys: async () => [...saidAbout, ...(await store.getNotifiedKeys())],
        rememberNotified: async (day, key) => {
          saidToday = day;
          saidAbout.add(key);
          await store.setLastNotified(day);
          const kept = [...(await store.getNotifiedKeys()), key];
          await store.setNotifiedKeys(kept.slice(-ATTENTION.rememberDeadlines));
        },
        now: () => Date.now(),
      });
      // Remembered with the moment it was taken, so the panel can say the same
      // thing in words for exactly as long as the badge is showing it.
      await store.setAttention({ count: out.count, at: out.count > 0 ? Date.now() : 0 });
      // Tab tooltips are per-tab and only change on a tab event, so a tab open
      // through the check would keep yesterday's words. Re-sweep (P10 review).
      sweep();
      if (out.reason === 'failed') console.warn('[gil&bricks] attention check failed');
    };

    /**
     * Re-assert the daily alarm. Chrome keeps alarms across a worker sleep but
     * NOT across an update or a profile that never had one, and creating an
     * alarm that already exists simply replaces it — so this is safe to call on
     * every wake, which is exactly what the MV3 docs advise.
     */
    const ensureAlarm = (): void => {
      chrome.alarms.get(ATTENTION.alarm).then((existing) => {
        if (existing) return;
        chrome.alarms.create(ATTENTION.alarm, { when: nextRun(Date.now()), periodInMinutes: ATTENTION.periodMinutes });
      }).catch(() => undefined);
    };

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ATTENTION.alarm) void checkAttention();
    });

    // Clicking the notification is the one place a click goes straight to the
    // board — that is what the notification is about.
    chrome.notifications.onClicked.addListener((id) => {
      if (id !== ATTENTION.alarm) return;
      void chrome.tabs.create({ url: `${coreConfig.appBaseUrl}${ATTENTION.board}` });
      chrome.notifications.clear(id);
    });

    // Switching reminders off has to mean silent, at once — not tomorrow.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !('gb:reminders' in changes)) return;
      void checkAttention();
    });

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
    chrome.runtime.onInstalled.addListener(() => { sweep(); ensureAlarm(); void checkAttention(); });
    chrome.runtime.onStartup.addListener(() => { sweep(); ensureAlarm(); void checkAttention(); });
    // main() runs on EVERY service-worker wake (not just install/startup), and
    // onInstalled/onStartup do NOT fire on a cold-start-from-idle. Without this
    // immediate sweep, a portal tab that was already active when the worker slept
    // has no per-tab enable, so it falls back to the global enabled:false and the
    // toolbar click opens the panel MENU instead of the panel. Sweeping here
    // re-enables the current portal tab so the icon opens the panel directly (E10).
    sweep();
    // A worker waking from idle gets neither onInstalled nor onStartup, so the
    // alarm is re-asserted here too: it is the only thing that keeps the daily
    // check alive across a sleep (P10).
    ensureAlarm();

    chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
      // React when the page settles or navigates (url only present on portal tabs).
      if (info.status === 'complete' || typeof info.url === 'string') apply(tabId, tab.url);
    });

    chrome.tabs.onActivated.addListener(({ tabId }) => {
      chrome.tabs.get(tabId).then((tab) => apply(tabId, tab.url)).catch(() => apply(tabId, undefined));
    });
  },
});

import { defineContentScript } from '#imports';
import { isListingUrl } from '@gil-bricks/core';
import { coreConfig } from '@gil-bricks/core/config';
import { extractCurrentPage, EXTRACT_MESSAGE } from '../src/extractPage';
import { mountOpener, retireOpener, OPENER_CSS, OPEN_PANEL_MESSAGE, PANEL_OPEN_MESSAGE } from '../src/opener';
import { getOpenerHidden, setOpenerHidden } from '../src/store';

/**
 * Declarative content script on Rightmove/Zoopla ONLY. It rides the existing
 * host_permissions — it needs no "scripting" permission (no programmatic
 * injection). It runs in the ISOLATED world, reads the page the user opened on
 * demand, and replies to the side panel. It never fetches a portal page and
 * never transmits page content anywhere but back to our own panel.
 *
 * D1 adds the in-page opener: on a LISTING page it puts one small button in the
 * corner that opens the side panel. Chrome forbids opening a panel on page load
 * (see src/opener.ts), and a click on our own button is the one gesture the API
 * accepts from a content script.
 */
export default defineContentScript({
  matches: ['*://*.rightmove.co.uk/*', '*://*.zoopla.co.uk/*'],
  runAt: 'document_idle',
  main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      // The panel says it is open — however it was opened. Take the button away.
      if (msg?.type === PANEL_OPEN_MESSAGE) {
        retireOpener(document);
        sendResponse({ ok: true });
        return false;
      }
      if (!msg || msg.type !== EXTRACT_MESSAGE) return false;
      extractCurrentPage()
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, portal: null, reason: 'unreadable', message: String(e?.message ?? e) }));
      return true; // keep the message channel open for the async reply
    });

    const offer = async (): Promise<void> => {
      // Only where there is something to analyse — never on a search page.
      if (!isListingUrl(location.href)) return;
      // "Hide" means hide: a dismissal is remembered until they turn it back on.
      if (await getOpenerHidden()) return;
      if (document.getElementById('gb-opener-style') === null) {
        const style = document.createElement('style');
        style.id = 'gb-opener-style';
        style.textContent = OPENER_CSS;
        document.head.append(style);
      }
      mountOpener({
        doc: document,
        brand: coreConfig.siteName,
        onHide: () => void setOpenerHidden(true),
        requestOpen: () =>
          chrome.runtime
            .sendMessage({ type: OPEN_PANEL_MESSAGE })
            .then((r: { opened?: boolean } | undefined) => r?.opened === true)
            .catch(() => false),
      });
    };

    void offer();
    // Both portals are single-page apps: the URL changes without a reload, so
    // the button has to follow the person from a search into a listing.
    // Compare WITHOUT the hash: both portals use hash routes for the gallery and
    // the floor plan, and re-offering the button there would put it back on a
    // page whose panel is already open (D1 review).
    const withoutHash = (): string => `${location.origin}${location.pathname}${location.search}`;
    let last = withoutHash();
    setInterval(() => {
      if (withoutHash() === last) return;
      last = withoutHash();
      document.getElementById('gb-open-panel')?.remove();
      void offer();
    }, 1000);
  },
});

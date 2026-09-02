import { defineContentScript } from '#imports';
import { extractCurrentPage, EXTRACT_MESSAGE } from '../src/extractPage';

/**
 * Declarative content script on Rightmove/Zoopla ONLY. It rides the existing
 * host_permissions — it needs no "scripting" permission (no programmatic
 * injection). It runs in the ISOLATED world, reads the page the user opened on
 * demand, and replies to the side panel. It never fetches a portal page and
 * never transmits page content anywhere but back to our own panel.
 */
export default defineContentScript({
  matches: ['*://*.rightmove.co.uk/*', '*://*.zoopla.co.uk/*'],
  runAt: 'document_idle',
  main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== EXTRACT_MESSAGE) return false;
      extractCurrentPage()
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, portal: null, reason: 'unreadable', message: String(e?.message ?? e) }));
      return true; // keep the message channel open for the async reply
    });
  },
});

import { describe, expect, it } from 'vitest';
import { applyTab, openPanelFor, paintBadgeStyle, BADGE, type ChromeLike } from '../src/panelState';

/**
 * The toolbar's behaviour per tab (D1), checked against a fake chrome — the
 * half of "a listing is obvious" that does not need a browser.
 */
function fakeChrome() {
  const calls = {
    badgeText: [] as { tabId?: number; text: string }[],
    titles: [] as { tabId?: number; title: string }[],
    options: [] as { tabId?: number; enabled: boolean }[],
    opened: [] as number[],
    colours: [] as string[],
  };
  const api: ChromeLike = {
    action: {
      setBadgeText: (d) => { calls.badgeText.push(d); return Promise.resolve(); },
      setBadgeBackgroundColor: (d) => { calls.colours.push(d.color); return Promise.resolve(); },
      setBadgeTextColor: (d) => { calls.colours.push(d.color); return Promise.resolve(); },
      setTitle: (d) => { calls.titles.push(d); return Promise.resolve(); },
    },
    sidePanel: {
      setOptions: (d) => { calls.options.push({ tabId: d.tabId, enabled: d.enabled }); return Promise.resolve(); },
      open: (d) => { calls.opened.push(d.tabId); return Promise.resolve(); },
    },
  };
  return { api, calls };
}

describe('the toolbar badge says when there is a deal to read', () => {
  it('badges a Rightmove listing and enables the panel', () => {
    const { api, calls } = fakeChrome();
    applyTab(api, 7, 'https://www.rightmove.co.uk/properties/167112923');
    expect(calls.badgeText).toEqual([{ tabId: 7, text: BADGE.text }]);
    expect(calls.titles[0].title).toBe(BADGE.onListing);
    expect(calls.options).toEqual([{ tabId: 7, enabled: true }]);
  });

  it('clears the badge on a search page, where there is nothing to analyse', () => {
    const { api, calls } = fakeChrome();
    applyTab(api, 7, 'https://www.rightmove.co.uk/property-for-sale/find.html?searchType=SALE');
    expect(calls.badgeText).toEqual([{ tabId: 7, text: '' }]);
    expect(calls.titles).toEqual([]);
    // still a portal page, so the panel itself stays available
    expect(calls.options).toEqual([{ tabId: 7, enabled: true }]);
  });

  it('badges nothing and disables the panel away from the portals', () => {
    const { api, calls } = fakeChrome();
    applyTab(api, 9, 'https://www.bbc.co.uk/news');
    expect(calls.badgeText).toEqual([{ tabId: 9, text: '' }]);
    expect(calls.options).toEqual([{ tabId: 9, enabled: false }]);
  });

  it('uses the brand colours: near-black text on lime, never the reverse', () => {
    const { api, calls } = fakeChrome();
    paintBadgeStyle(api);
    expect(calls.colours).toEqual(['#dcff00', '#070014']);
  });
});

describe('the in-page button opens the panel', () => {
  it('opens for the tab the click came from', async () => {
    const { api, calls } = fakeChrome();
    expect(await openPanelFor(api, 12)).toEqual({ opened: true });
    expect(calls.opened).toEqual([12]);
  });

  it('answers honestly when Chrome refuses (no gesture survived the hop)', async () => {
    const { api } = fakeChrome();
    api.sidePanel.open = () => Promise.reject(new Error('user gesture required'));
    expect(await openPanelFor(api, 12)).toEqual({ opened: false });
  });

  it('does nothing without a tab', async () => {
    const { api, calls } = fakeChrome();
    expect(await openPanelFor(api, undefined)).toEqual({ opened: false });
    expect(calls.opened).toEqual([]);
  });
});

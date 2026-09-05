import { describe, expect, it, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { mountOpener, retireOpener, OPENER_COPY, OPEN_PANEL_MESSAGE, PANEL_OPEN_MESSAGE, _resetOpener } from '../src/opener';

/**
 * The in-page opener (D1). Chrome forbids opening a side panel on page load, so
 * this button is the one legal route from the listing page into the panel.
 * These tests hold it to that: it appears, it asks the worker to open, and when
 * Chrome refuses it says what to do instead rather than looking broken.
 */
const BRAND = 'PropLaunch';

const docOf = (): Document => {
  const w = new Window();
  return w.document as unknown as Document;
};

describe('the in-page opener', () => {
  beforeEach(() => _resetOpener());

  it('mounts one chip with an open button and a way to hide it', () => {
    const doc = docOf();
    const chip = mountOpener({ doc, brand: BRAND, requestOpen: () => Promise.resolve(true) });
    expect(chip).not.toBeNull();
    expect(doc.querySelectorAll('#gb-open-panel').length).toBe(1);
    expect(doc.querySelector('#gb-open-panel .gb-open')?.textContent).toBe(OPENER_COPY.label);
    expect(doc.querySelector('#gb-open-panel .gb-hide')?.textContent).toBe(OPENER_COPY.dismiss);
  });

  it('never mounts twice on the same page', () => {
    const doc = docOf();
    mountOpener({ doc, brand: BRAND, requestOpen: () => Promise.resolve(true) });
    expect(mountOpener({ doc, brand: BRAND, requestOpen: () => Promise.resolve(true) })).toBeNull();
    expect(doc.querySelectorAll('#gb-open-panel').length).toBe(1);
  });

  it('carries the product name, so it never passes for the portal\u2019s own button', () => {
    const doc = docOf();
    mountOpener({ doc, brand: BRAND, requestOpen: () => Promise.resolve(true) });
    expect(doc.querySelector('#gb-open-panel .gb-mark')?.textContent).toBe(BRAND);
  });

  it('gets out of the way once the panel is open', async () => {
    const doc = docOf();
    mountOpener({ doc, brand: BRAND, requestOpen: () => Promise.resolve(true) });
    (doc.querySelector('#gb-open-panel .gb-open') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(doc.querySelector('#gb-open-panel')).toBeNull();
  });

  it('tells the caller to remember a Hide, so it is not undone by a reload', () => {
    const doc = docOf();
    let remembered = false;
    mountOpener({ doc, brand: BRAND, requestOpen: () => Promise.resolve(true), onHide: () => { remembered = true; } });
    (doc.querySelector('#gb-open-panel .gb-hide') as HTMLElement).click();
    expect(remembered).toBe(true);
  });

  it('asks the worker to open the panel when the button is clicked', async () => {
    const doc = docOf();
    let asked = 0;
    mountOpener({ doc, brand: BRAND, requestOpen: () => { asked += 1; return Promise.resolve(true); } });
    (doc.querySelector('#gb-open-panel .gb-open') as HTMLElement).click();
    await Promise.resolve();
    expect(asked).toBe(1);
  });

  it('says what to do instead when Chrome refuses the open', async () => {
    const doc = docOf();
    mountOpener({ doc, brand: BRAND, requestOpen: () => Promise.resolve(false) });
    const btn = doc.querySelector('#gb-open-panel .gb-open') as HTMLElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(btn.textContent).toBe(OPENER_COPY.fallback);
  });

  it('stays hidden for the rest of the page once dismissed', () => {
    const doc = docOf();
    mountOpener({ doc, brand: BRAND, requestOpen: () => Promise.resolve(true) });
    (doc.querySelector('#gb-open-panel .gb-hide') as HTMLElement).click();
    expect(doc.querySelector('#gb-open-panel')).toBeNull();
    expect(mountOpener({ doc, brand: BRAND, requestOpen: () => Promise.resolve(true) })).toBeNull();
  });

  it('retires — not dismisses — when the panel is opened any other way', () => {
    const doc = docOf();
    mountOpener({ doc, brand: BRAND, requestOpen: () => Promise.resolve(true) });
    retireOpener(doc);
    expect(doc.querySelector('#gb-open-panel')).toBeNull();
    // still gone on this page…
    expect(mountOpener({ doc, brand: BRAND, requestOpen: () => Promise.resolve(true) })).toBeNull();
    // …but the next page offers it again, unlike a Hide
    _resetOpener();
    const next = docOf();
    expect(mountOpener({ doc: next, brand: BRAND, requestOpen: () => Promise.resolve(true) })).not.toBeNull();
  });

  it('the message names are the ones the worker and the panel use', () => {
    expect(OPEN_PANEL_MESSAGE).toBe('gb:open-panel');
    expect(PANEL_OPEN_MESSAGE).toBe('gb:panel-open');
  });
});

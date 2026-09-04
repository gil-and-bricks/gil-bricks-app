// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYSER_SECTIONS } from '../../config/analyserSections';
import { startSectionStrip } from './sectionStrip.client';

/**
 * The strip's enhancement layer as the browser runs it: reveal only the chips
 * whose section exists, mark the one being read, publish the height the page's
 * scroll-padding depends on. The jumping itself is a plain anchor — no code.
 */
const stripHtml = ANALYSER_SECTIONS.map((s) => `<li><a class="strip-chip" href="#${s.id}" data-chip="${s.id}" hidden>${s.label}</a></li>`).join('');

/** happy-dom has no layout, so every rect is stated explicitly. */
const rect = (el: Element, r: Partial<DOMRect>): void => {
  el.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...r }) as DOMRect;
};

let strip: HTMLElement;
const chip = (id: string) => document.querySelector<HTMLAnchorElement>(`[data-chip="${id}"]`)!;
/** MutationObserver delivers on a microtask; the strip then re-syncs in a frame. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 1));
};

beforeEach(() => {
  document.documentElement.style.cssText = '';
  document.body.innerHTML = `<nav class="section-strip" data-section-strip><ul class="strip-row">${stripHtml}</ul></nav><main></main>`;
  strip = document.querySelector<HTMLElement>('.section-strip')!;
  rect(strip, { top: 0, bottom: 44, height: 44, left: 0, right: 390, width: 390 });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('section overview strip — the enhancement layer (N2)', () => {
  it('reveals only the chips whose section is on the page, and nothing else', () => {
    const main = document.querySelector('main')!;
    main.innerHTML = '<div id="sec-property"></div><div id="sec-verdict"></div><div id="sec-comps"></div>';
    for (const id of ['sec-property', 'sec-verdict', 'sec-comps']) rect(document.getElementById(id)!, { top: 500 });
    startSectionStrip();
    expect(chip('sec-property').hidden).toBe(false);
    expect(chip('sec-verdict').hidden).toBe(false);
    expect(chip('sec-comps').hidden).toBe(false);
    expect(chip('sec-area').hidden).toBe(true);
    expect(chip('sec-figures').hidden).toBe(true);
    expect(strip.classList.contains('is-live')).toBe(true);
  });

  it('stays dark with nothing to jump to (no chips, no reserved height)', () => {
    startSectionStrip();
    expect(document.querySelectorAll('.strip-chip:not([hidden])').length).toBe(0);
    expect(strip.classList.contains('is-live')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--strip-h')).toBe('0px');
  });

  it('publishes its height so scroll-padding clears it, and marks what you are reading', () => {
    const main = document.querySelector('main')!;
    main.innerHTML = '<div id="sec-property"></div><div id="sec-verdict"></div><div id="sec-comps"></div>';
    rect(document.getElementById('sec-property')!, { top: -900 });
    rect(document.getElementById('sec-verdict')!, { top: -40 });
    rect(document.getElementById('sec-comps')!, { top: 600 });
    startSectionStrip();
    expect(document.documentElement.style.getPropertyValue('--strip-h')).toBe('44px');
    expect(chip('sec-verdict').getAttribute('aria-current')).toBe('true');
    expect(chip('sec-property').hasAttribute('aria-current')).toBe(false);
  });

  it('un-sticks the pinned pair on a screen it would eat (>30% of the viewport)', () => {
    const main = document.querySelector('main')!;
    main.innerHTML = '<div id="sec-property"></div>';
    rect(document.getElementById('sec-property')!, { top: 100 });
    document.documentElement.style.setProperty('--sticky-h', '53px');
    vi.stubGlobal('innerHeight', 260); // 53 + 44 = 97 of 260 = 37%
    startSectionStrip();
    expect(strip.classList.contains('is-unstuck')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--strip-h')).toBe('0px');
  });

  it('follows the page: a section that appears later gets its chip', async () => {
    const main = document.querySelector('main')!;
    main.innerHTML = '<div id="sec-property"></div>';
    rect(document.getElementById('sec-property')!, { top: 10 });
    startSectionStrip();
    expect(chip('sec-comps').hidden).toBe(true);
    const later = document.createElement('div');
    later.id = 'sec-comps';
    main.appendChild(later);
    rect(later, { top: 800 });
    await flush();
    expect(chip('sec-comps').hidden).toBe(false);
  });
});

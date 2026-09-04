import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { strategies } from '@gil-bricks/core';
import { COMING_SOON, NAV } from './nav';

/**
 * The nav promises destinations; these hold it to them. Every label and every
 * grouping is config, so this is where "the nav must not lie" is enforced.
 */
/** The routes that ACTUALLY exist, read from src/pages — a hand-typed list
 * could not notice a page being deleted, which is exactly the day the nav
 * starts lying. `[strategy]/analyser.astro` expands to the four strategies. */
const PAGES = fileURLToPath(new URL('../pages/', import.meta.url));
const ROUTES = new Set(
  readdirSync(PAGES, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '[strategy]') return strategies.map((s) => `${s.route}/analyser`);
    if (entry.isDirectory()) return readdirSync(new URL(`../pages/${entry.name}/`, import.meta.url)).map((f) => `/${entry.name}/${f.replace(/\.astro$/, '')}`);
    if (!entry.name.endsWith('.astro')) return [];
    const name = entry.name.replace(/\.astro$/, '');
    return [name === 'index' ? '/' : `/${name}`];
  }),
);

describe('navigation (N4)', () => {
  const everyLink = [
    ...NAV.primary, ...NAV.mine, ...NAV.bottom, ...NAV.more.links,
    { label: NAV.analyse.label, href: NAV.analyse.href },
    { label: COMING_SOON.tools.cta.label, href: COMING_SOON.tools.cta.href },
    { label: COMING_SOON.finance.cta.label, href: COMING_SOON.finance.cta.href },
  ];

  it('every destination in the nav is a page this site actually has', () => {
    for (const l of everyLink) expect(ROUTES.has(l.href), `${l.label} → ${l.href}`).toBe(true);
  });

  it('every item has a label, and no label is a placeholder', () => {
    for (const l of everyLink) {
      expect(l.label.trim().length, l.href).toBeGreaterThan(0);
      expect(l.label).not.toMatch(/tbd|todo|xxx/i);
    }
  });

  it('the bottom bar holds five slots — Analyse, three more destinations, and More', () => {
    expect(NAV.bottom.length + 1).toBe(4);
    expect(NAV.more.label.trim().length).toBeGreaterThan(0);
  });

  it('the route list is read from the pages that exist, and it found them', () => {
    expect(ROUTES.has('/')).toBe(true);
    expect(ROUTES.has('/tools')).toBe(true);
    expect(ROUTES.has('/finance')).toBe(true);
    expect(ROUTES.size).toBeGreaterThan(8);
    expect(ROUTES.has('/definitely-not-a-page')).toBe(false);
  });

  it('nothing that is in the bottom bar is repeated inside the More sheet', () => {
    const bottom = new Set([NAV.analyse.href, ...NAV.bottom.map((l) => l.href)]);
    for (const l of NAV.more.links) expect(bottom.has(l.href), l.label).toBe(false);
  });

  it('every place the nav can reach is at most two taps away on a phone', () => {
    // one tap: the four bottom destinations; two taps: More → its links, or
    // Analyse → the segmented switcher's other three strategies
    const oneTap = [NAV.analyse.href, ...NAV.bottom.map((l) => l.href)];
    const twoTaps = [...NAV.more.links.map((l) => l.href), ...strategies.map((s) => `${s.route}/analyser`)];
    const reachable = new Set([...oneTap, ...twoTaps]);
    for (const l of [...NAV.primary, ...NAV.mine]) expect(reachable.has(l.href), l.label).toBe(true);
  });

  it('the coming-soon pages say what is coming and point somewhere useful meanwhile', () => {
    for (const page of [COMING_SOON.tools, COMING_SOON.finance]) {
      expect(page.body.length).toBeGreaterThan(0);
      expect(page.body.join(' ')).toMatch(/not built yet|nothing here is built/i);
      expect(page.cta.href.startsWith('/')).toBe(true);
    }
  });
});

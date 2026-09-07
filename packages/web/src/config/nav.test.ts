import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { strategies } from '@gil-bricks/core';
import { NAV, desktopMoreLinks, moreLinks, primaryLinks } from './nav';
import { ACCOUNT, AUTH_HEADER } from './account';
import { features } from './features';

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
    if (entry.isDirectory()) {
      return readdirSync(new URL(`../pages/${entry.name}/`, import.meta.url))
        .filter((f) => f.endsWith('.astro'))
        .map((f) => (f === 'index.astro' ? `/${entry.name}` : `/${entry.name}/${f.replace(/\.astro$/, '')}`));
    }
    if (!entry.name.endsWith('.astro')) return [];
    const name = entry.name.replace(/\.astro$/, '');
    return [name === 'index' ? '/' : `/${name}`];
  }),
);

describe('navigation (N4)', () => {
  const everyLink = [
    ...NAV.primary, ...NAV.mine, ...NAV.bottom, ...NAV.more.links,
    { label: NAV.analyse.label, href: NAV.analyse.href },
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
    expect(ROUTES.has('/bridging-finance')).toBe(true);
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

});

/**
 * THE NAV STRUCTURE IS PINNED (A2).
 *
 * Four navigation decisions the operator made were quietly not live: the header
 * carried three controls for two destinations ("Deals" → the pipeline,
 * "Account" → /account, and an avatar labelled "My deals" → /account as well),
 * Account sat in the nav row instead of beside the socials, the account page
 * carried a second deals card, and Bridging finance had been filtered out of
 * the header altogether.
 *
 * None of it was caught, because nothing said what the nav is SUPPOSED to be.
 * This does. It is deliberately a written-down shape rather than a smoke test:
 * changing the nav should mean changing this file on purpose, in the same
 * commit, so the change is a decision and not an accident.
 */
describe('the nav structure, pinned (A2)', () => {
  it('the header primary row is Area Data, Tools, Bridging finance — in that order', () => {
    expect(NAV.primary.map((l) => `${l.label} → ${l.href}`)).toEqual([
      'Area Data → /area-data', 'Tools → /tools', 'Bridging finance → /bridging-finance',
    ]);
  });

  it('Bridging finance is reachable from the header, whatever the broker gate says', () => {
    // D1 filtered it out until the broker was real; the operator reversed that
    // on 2026-09-07. This must hold in BOTH broker states — the day the operator
    // fills in the broker's details is not a day for a nav test to go red — so
    // it asserts the route, never the gate. The enquiry FORM is still gated;
    // that is brokerReady()'s job and lib/bridging.test.ts's to check.
    expect(primaryLinks().map((l) => l.href)).toContain('/bridging-finance');
    expect(moreLinks().map((l) => l.href)).toContain('/bridging-finance');
  });

  it('the right-hand cluster is ONE link, to the pipeline — the account is not in it', () => {
    // The LABEL is pinned too: a link called "Account" that opens the pipeline,
    // beside an avatar control also called "Account" that opens the account, is
    // the bug this sprint exists to remove — inverted, not fixed.
    expect(NAV.mine.map((l) => `${l.label} → ${l.href}`)).toEqual(['Deals → /deals']);
  });

  it('exactly ONE thing in the whole header config points at the pipeline', () => {
    const all = [...NAV.primary, ...NAV.mine, ...NAV.more.links];
    expect(all.filter((l) => l.href === '/deals')).toHaveLength(1);
  });

  it('nothing in the DESKTOP header points at /account — the avatar control owns it', () => {
    // The signed-in control (AuthHeader) is the one route to /account on a
    // desktop, and it sits beside the socials. The second link in the nav row
    // was the duplicate — one of them called "My deals", beside a "Deals" that
    // went somewhere else entirely.
    const desktopHeader = [...NAV.primary, ...NAV.mine, ...desktopMoreLinks()];
    expect(desktopHeader.filter((l) => l.href === '/account')).toEqual([]);
    expect(AUTH_HEADER.account).toBe('Account');
  });

  it('a flag that is off takes its destination out of the nav with it', () => {
    // Both pages render something honest but incomplete with their flag off, so
    // the nav must not point at them. Restored exactly, in a finally.
    const kept = { bridgingFinance: features.bridgingFinance, creditPage: features.creditPage };
    try {
      features.bridgingFinance = false;
      features.creditPage = false;
      expect(primaryLinks().map((l) => l.href)).not.toContain('/bridging-finance');
      expect(moreLinks().map((l) => l.href)).not.toContain('/bridging-finance');
      expect(moreLinks().map((l) => l.href)).not.toContain('/credit');
    } finally {
      Object.assign(features, kept);
    }
  });

  it('the More sheet holds the pages that fit nowhere else, and repeats nothing above it', () => {
    // Account is N4's decision and stays in the PHONE sheet; the desktop drops
    // it, because there the avatar control beside the socials is on screen.
    expect(NAV.more.links.map((l) => `${l.label} → ${l.href}`)).toEqual([
      'Bridging finance → /bridging-finance', 'Sold comparables → /comparables', 'Credit → /credit',
      'Account → /account', 'Where should I start? → /start', 'Privacy → /privacy', 'Terms → /terms',
    ]);
  });

  it('the DESKTOP More drops what the desktop already shows, and keeps what it does not', () => {
    // Everything the phone sheet holds, minus what the desktop chrome already
    // shows. Written out rather than derived, so a change to either list has to
    // be a decision made here.
    expect(desktopMoreLinks().map((l) => l.href)).toEqual(['/comparables', '/credit', '/start']);
  });

  it('the bottom bar is four destinations plus the More disclosure — five slots', () => {
    expect([NAV.analyse.href, ...NAV.bottom.map((l) => l.href)])
      .toEqual(['/buy-to-let/analyser', '/area-data', '/tools', '/deals']);
  });
});

/**
 * AND THE HEADER MUST ACTUALLY RENDER IT (A2).
 *
 * Pinning the config alone was not enough, and an adversarial review proved it:
 * with the config assertions above all green, you could still repoint the
 * avatar control at /deals, rewire the desktop More to the raw phone list, drop
 * the `.nav-mine` span, or put the deals card back on the account page — and
 * the suite stayed green while the header went back to being exactly what the
 * operator complained about.
 *
 * These read the components. Source-text assertions are blunt, and they are how
 * this repo already holds its other structural rules (reversibility.test.ts,
 * noindex.test.ts). Blunt and true beats elegant and asleep.
 */
describe('the header renders the pinned structure (A2)', () => {
  const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const header = read('../components/site/Header.astro');
  const authHeader = read('../components/auth/AuthHeader.tsx');
  const accountApp = read('../components/auth/AccountApp.tsx');

  it('the desktop More reads desktopMoreLinks(), never the raw phone sheet', () => {
    expect(header).toContain('desktopMoreLinks()');
    // moreLinks() would bypass DESKTOP_MORE_OMITS and put a second Bridging
    // finance, plus the footer's Privacy and Terms, in the desktop header.
    expect(header.includes('moreLinks()') && !header.includes('desktopMoreLinks()')).toBe(false);
    expect(/\bmoreLinks\(\)/.test(header.replace(/desktopMoreLinks\(\)/g, ''))).toBe(false);
  });

  it('the header renders the right-hand cluster and the signed-in control', () => {
    expect(header).toContain('NAV.mine.map');
    expect(header).toContain('<AuthHeader');
  });

  it('the signed-in control points at /account and is labelled from config', () => {
    // Repointing this at /deals would leave the product with no route to the
    // account at all, behind a control still called "Account".
    expect(authHeader).toContain('href="/account"');
    expect(authHeader).toContain('AUTH_HEADER.account');
    expect(authHeader).not.toContain('myDeals');
  });

  it('the account page carries no deals card while the pipeline is on', () => {
    expect(accountApp).toContain('features.dealPipeline ? null : (');
    // and its copy is gone, so re-adding the card cannot be a one-line change
    expect(Object.keys(ACCOUNT)).not.toContain('pipeline');
  });
});

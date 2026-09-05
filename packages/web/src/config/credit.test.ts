import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CREDIT, creditLinkReady, creditVideoReady } from './credit';
import { NAV } from './nav';
import { TOOLS } from './tools';

/**
 * The credit page (T3) is the site's ONE paid partnership, and the only reason
 * it is not grubby is the order it is written in: the insight first, the
 * disclosure above the link, the AD marker where nobody can miss it. These
 * tests hold that order, and hold the page honest while the link is not live.
 */
const page = readFileSync(fileURLToPath(new URL('../pages/credit.astro', import.meta.url)), 'utf8');

describe('the disclosure comes before the link', () => {
  it('the AD marker is at the top of the page, not in the footer', () => {
    const marker = page.indexOf('ad-marker');
    const h1 = page.indexOf('page-title');
    expect(marker).toBeGreaterThan(-1);
    expect(marker, 'the AD marker sits above the H1').toBeLessThan(h1);
  });

  it('the disclosure block is rendered before the affiliate link', () => {
    const disclosure = page.indexOf('CREDIT.disclosure.lines');
    const link = page.indexOf('CREDIT.affiliateUrl');
    expect(disclosure).toBeGreaterThan(-1);
    expect(link).toBeGreaterThan(-1);
    expect(disclosure, 'disclosure first, link second').toBeLessThan(link);
  });

  it('says all three things, in the operator’s own words', () => {
    const said = CREDIT.disclosure.lines.join(' ').toLowerCase();
    expect(said).toContain('only paid partnership');
    expect(said).toContain('i get a small amount');
    expect(said).toContain('i use it myself');
  });

  it('carries a plain advertising label, not a euphemism', () => {
    expect(CREDIT.adLabel).toBe('AD');
    expect(CREDIT.adLabelFull.toLowerCase()).toContain('paid partnership');
  });

  it('the link itself is marked as sponsored for machines too', () => {
    expect(page).toContain('rel="sponsored nofollow noopener"');
  });
});

describe('the page leads with the insight, not the product', () => {
  it('the title is about the reader’s score, not the partner', () => {
    expect(CREDIT.title.toLowerCase()).not.toContain(CREDIT.partner.toLowerCase());
    expect(CREDIT.title.toLowerCase()).toContain('score');
  });

  it('the insight is on the page before the disclosure and the link', () => {
    const insight = page.indexOf('CREDIT.insight.body');
    const disclosure = page.indexOf('CREDIT.disclosure.lines');
    expect(insight).toBeGreaterThan(-1);
    expect(insight).toBeLessThan(disclosure);
  });

  it('explains the multi-agency point plainly', () => {
    const body = CREDIT.insight.body.join(' ').toLowerCase();
    expect(body).toContain('agencies');
    expect(body).toContain('lender');
  });

  it('never claims to be advice or to promise a lender’s answer', () => {
    const limits = CREDIT.limits.join(' ').toLowerCase();
    expect(limits).toContain('not credit advice');
    expect(limits).toContain('not a promise');
    const words = JSON.stringify(CREDIT).toLowerCase();
    for (const claim of ['guarantee', 'boost your score', 'fix your credit', 'approved']) {
      expect(words).not.toContain(claim);
    }
  });
});

describe('nothing dead ever renders', () => {
  it('with no affiliate URL there is no button, and the page says so', () => {
    expect(creditLinkReady()).toBe(CREDIT.affiliateUrl.trim().startsWith('http'));
    if (!creditLinkReady()) {
      expect(CREDIT.notLive.heading.toLowerCase()).toContain('not live yet');
      expect(CREDIT.notLive.body.length).toBeGreaterThan(0);
    }
  });

  it('the video is click-to-load, never autoplay, and honest while it is missing', () => {
    expect(page).not.toContain('autoplay');
    expect(page).toContain('data-play');
    if (!creditVideoReady()) expect(CREDIT.video.placeholder.toLowerCase()).toContain('coming');
    expect(CREDIT.video.note.toLowerCase()).toContain('only when you press play');
  });
});

describe('where the page lives', () => {
  it('is reachable from the More sheet', () => {
    expect(NAV.more.links.map((l) => l.href)).toContain('/credit');
  });

  it('is NOT in Tools — a recommendation is not a calculator', () => {
    expect(TOOLS.map((t) => t.slug)).not.toContain('credit');
    expect(NAV.primary.map((l) => l.href)).not.toContain('/credit');
  });
});

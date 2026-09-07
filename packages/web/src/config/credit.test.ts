import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CREDIT, creditLinkReady, creditVideoReady } from './credit';
import { NAV } from './nav';
import { features } from './features';
import { BRIDGING, BRIDGING_CREDIT, BRIDGING_NOT_OPEN, BRIDGING_VIDEO, BROKER, bridgingVideoReady } from './bridging';
import { TOOLS } from './tools';

/**
 * The credit page (T3) is the site's ONE paid partnership, and the only reason
 * it is not grubby is the order it is written in: the insight first, the
 * disclosure above the link, the AD marker where nobody can miss it. These
 * tests hold that order, and hold the page honest while the link is not live.
 */
const page = readFileSync(fileURLToPath(new URL('../pages/credit.astro', import.meta.url)), 'utf8');
const slot = readFileSync(fileURLToPath(new URL('../components/site/VideoSlot.astro', import.meta.url)), 'utf8');

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
    // The ASA wants an ad identifiable BEFORE engagement, and has held that
    // softer words alone are not enough. The badge is not a tone choice.
    expect(CREDIT.adLabel).toBe('AD');
    expect(CREDIT.adLabelFull.toLowerCase()).toContain('paid partnership');
  });

  it('the line beside the badge is in the operator’s voice, not boilerplate', () => {
    const line = CREDIT.adLabelFull.toLowerCase();
    expect(line, 'says what it is').toContain('only paid partnership');
    expect(line, 'says what he gets').toContain('i get');
    expect(line, 'says what it costs you').toContain('no extra cost');
    expect(line, 'the stacked labels are gone').not.toContain('advertisement —');
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
    // The slot itself is shared with the bridging page (S1), so the click-to-load
    // guarantee is asserted where it now lives.
    expect(page).toContain('<VideoSlot');
    // autoplay as a SETTING — `?autoplay=1`, `allow="autoplay"` — not the word
    // itself, which the file uses to say it never does this.
    expect(slot, 'never asks YouTube to autoplay').not.toMatch(/autoplay\s*[=:]/);
    expect(slot, 'never permits autoplay').not.toMatch(/allow[^>]*autoplay/);
    expect(slot).toContain('data-play');
    if (!creditVideoReady()) expect(CREDIT.video.placeholder.toLowerCase()).toContain('coming');
    expect(CREDIT.video.note.toLowerCase()).toContain('only when you press play');
  });

  it('the iframe is built INSIDE the click handler, so nothing loads before the click', () => {
    // This replaces a `not.toContain('<iframe')` that could never have failed:
    // the slot builds its iframe with createElement, so the old assertion was
    // structurally incapable of testing the guarantee its message claimed. The
    // no-cookie-banner promise rests on this, so it is asserted by POSITION.
    const click = slot.indexOf("addEventListener('click'");
    const makes = slot.indexOf("createElement('iframe')");
    const embeds = slot.indexOf('youtube-nocookie.com/embed');
    expect(click, 'there is a click handler').toBeGreaterThan(-1);
    expect(makes, 'the iframe is created after the handler opens').toBeGreaterThan(click);
    expect(embeds, 'the embed URL is built after the handler opens').toBeGreaterThan(click);
    // and the only iframe/embed in the file is that one
    expect(slot.match(/createElement\('iframe'\)/g)).toHaveLength(1);
    expect(slot).not.toMatch(/<iframe/);
  });

  it('no page hand-rolls its own embed, bypassing the slot entirely', () => {
    // The guard S1 removed from credit.astro, restored and widened: BOTH pages
    // that carry a video, and every other page, must go through VideoSlot.
    const srcDir = fileURLToPath(new URL('..', import.meta.url));
    for (const f of readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
      .filter((n) => n.endsWith('.astro') && n !== 'components/site/VideoSlot.astro')) {
      const body = readFileSync(join(srcDir, f), 'utf8');
      expect(body, `${f} must not embed a player directly`).not.toMatch(/<iframe/);
      expect(body, `${f} must not autoplay anything`).not.toMatch(/autoplay\s*[=:]/);
      expect(body, `${f} must not reach youtube outside the slot`).not.toMatch(/youtube\.com\/embed/);
    }
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

describe('the ad marker belongs to the credit page and nowhere else', () => {
  /**
   * S1 — the operator reported a "paid ad" marker on the bridging page. It is
   * not there (see DECISIONS_LOG), but nothing stopped it arriving: the marker
   * is just a class and a string, and the bridging page links to the credit
   * page. This makes the containment a rule instead of a coincidence.
   *
   * The bridging page introduces a broker and has nothing paid on it, so an ad
   * marker there would be a false statement about the page.
   */
  // EVERY .astro in the app, not just the pages: this sprint added a SHARED
  // component that renders on both /credit and /bridging-finance, so a marker
  // put there would reach the bridging page while a pages-only scan stayed green.
  // AppShell and Footer are in the same class — they render on every page.
  const srcDir = fileURLToPath(new URL('..', import.meta.url));
  const astroFiles = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.astro'));

  it('only the credit page renders the AD badge or the ad marker — no component may', () => {
    const carriers = astroFiles.filter((f) => {
      const body = readFileSync(join(srcDir, f), 'utf8');
      return body.includes('ad-badge') || body.includes('ad-marker')
        || body.includes('adLabel') || body.includes('CREDIT.disclosure');
    });
    expect(carriers).toEqual(['pages/credit.astro']);
  });

  it('the scan actually reaches shared components, not only pages', () => {
    // A positive control on the control: if this list ever stops containing the
    // shared slot, the scan above has quietly narrowed and proves nothing.
    expect(astroFiles).toContain('components/site/VideoSlot.astro');
    expect(astroFiles).toContain('layouts/AppShell.astro');
  });

  it('the bridging page says nothing about advertising or paid partnership', () => {
    // BRIDGING_NOT_OPEN is the state the live page is in right now, and BROKER
    // is rendered by name — the two most visible objects were the two missing.
    const words = JSON.stringify([BRIDGING, BRIDGING_CREDIT, BRIDGING_VIDEO, BRIDGING_NOT_OPEN, BROKER]).toLowerCase();
    for (const claim of ['advertis', 'paid partnership', 'affiliate', 'sponsored', 'commission']) {
      expect(words, `the bridging page must not say "${claim}"`).not.toContain(claim);
    }
  });
});

describe('the bridging page video slot (S1)', () => {
  const bridgingPage = readFileSync(fileURLToPath(new URL('../pages/bridging-finance.astro', import.meta.url)), 'utf8');

  it('sits below the explanation and above the enquiry form', () => {
    const risk = bridgingPage.indexOf('BRIDGING.risk.items');
    const video = bridgingPage.indexOf('<VideoSlot');
    const form = bridgingPage.indexOf('<BridgingEnquiry');
    expect(video).toBeGreaterThan(-1);
    expect(risk, 'the explanation comes first').toBeLessThan(video);
    expect(video, 'the form comes last').toBeLessThan(form);
  });

  it('is honest while it is empty and never renders a dead player', () => {
    expect(bridgingVideoReady()).toBe(BRIDGING_VIDEO.url.trim().startsWith('http'));
    if (!bridgingVideoReady()) {
      expect(BRIDGING_VIDEO.placeholder.toLowerCase()).toContain('coming');
      expect(BRIDGING_VIDEO.url).toBe('');
    }
  });

  it('is removable from config, behind its own named flag', () => {
    expect(features).toHaveProperty('bridgingVideo');
    expect(bridgingPage).toContain('features.bridgingVideo');
  });

  it('uses the SAME slot as the credit page, so the two cannot drift', () => {
    expect(bridgingPage).toContain('<VideoSlot');
    expect(page, 'the credit page uses it too').toContain('<VideoSlot');
  });
});

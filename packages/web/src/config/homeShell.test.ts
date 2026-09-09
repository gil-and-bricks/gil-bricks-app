import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OGL_ATTRIBUTION } from '@gil-bricks/core';
import { HOME } from './home';
import { FOOTER } from './nav';
import { features } from './features';

/**
 * The homepage and the shell (H1), pinned.
 *
 * All four came from the operator looking at the live site: two social marks
 * that were official but not optically equal, a hero that printed the product
 * name directly under the header's copy of it, a page whose first offer was
 * "See area data", and a footer that was a left-aligned list of leftovers.
 */
const src = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string): string => readFileSync(`${src}${p}`, 'utf8');
const home = read('pages/index.astro');
const footer = read('components/site/Footer.astro');
const marks = read('components/site/SocialMarks.astro');
const css = read('styles/analyser.css');

describe('the hero says what it does, not our name again', () => {
  it('the product name and the maker are gone from it', () => {
    const hero = home.slice(home.indexOf('<section class="home-hero">'), home.indexOf('</section>', home.indexOf('<section class="home-hero">')));
    expect(hero, 'the header already says it, immediately above').not.toContain('siteConfig.siteName');
    expect(hero).not.toContain('siteConfig.makerName');
    expect(hero, 'the h1 is the promise, from config').toContain('<h1>{HOME.lead}</h1>');
  });

  it('the sub-line is centred on the same axis as everything around it', () => {
    // It had a 44rem max-width and no auto margin, so inside a centred hero it
    // sat flush LEFT. That was the misalignment the operator could see.
    expect(css).toMatch(/\.home-sub \{[^}]*margin: var\(--space-4\) auto 0/);
  });

  it('the hero leads to the analyser, not to area data', () => {
    const hero = home.slice(home.indexOf('<section class="home-hero">'), home.indexOf('</section>', home.indexOf('<section class="home-hero">')));
    expect(hero).toContain('href="/buy-to-let/analyser"');
    expect(hero, 'the postcode box moved down with the other ways in').not.toContain('/area-data');
  });
});

describe('the page meets a stranger in the right order', () => {
  it('what it is, then proof, then the ways in', () => {
    const at = (needle: string) => {
      const i = home.indexOf(needle);
      expect(i, `${needle} is on the page`).toBeGreaterThan(-1);
      return i;
    };
    const hero = at('<section class="home-hero">');
    const example = at('home-example');
    const does = at('home-does');
    const ways = at('home-ways-h');
    const ext = at('home-extension');
    const area = at('home-area');
    expect(hero).toBeLessThan(example);
    expect(example, 'the worked example comes before the list of claims').toBeLessThan(does);
    expect(does).toBeLessThan(ways);
    expect(ways, 'the extension is the first way in — it fits somebody on a listing').toBeLessThan(ext);
    expect(ext, 'area data is a way in, not the headline').toBeLessThan(area);
  });

  it('the ways in are one GROUP, not four sections after a heading', () => {
    expect(home).toContain('<section class="home-ways" aria-labelledby="home-ways-h">');
    // Demoting the group's headings without demoting the cards inside them
    // makes a card a sibling of the heading meant to group it.
    expect(home).toMatch(/<h4><a href=\{`\$\{s\.route\}\/analyser`\}>\{s\.name\}<\/a><\/h4>/);
  });

  it('and the demoted headings kept the type scale, not the browser default', () => {
    expect(css).toMatch(/\.home-ways > section > h3[\s\S]{0,80}font-size: var\(--text-lg\)/);
  });

  it('the postcode form shares its card’s left edge', () => {
    // Centred it was fine leading the hero; inside a card whose heading is
    // left-aligned it put the two on different axes from ~640px up.
    expect(css).toContain('.home-search { max-width: 34rem; text-align: left; }');
    expect(css).toContain('.home-hero .home-search { margin: 0 auto; }');
  });

  it('the Deal Score example is still computed, not written down', () => {
    expect(home).toContain('analyseBtl(exampleInputs)');
    expect(home).toContain("scoreDeal('btl', exampleInputs)");
  });
});

describe('the video slot is honest while it is empty', () => {
  it('nothing is loaded until somebody presses play', () => {
    expect(HOME.video.url, 'no video yet, and the page must not pretend').toBe('');
    expect(home).toContain("ready={HOME.video.url.trim() !== ''}");
    expect(home, 'the same component the bridging and credit pages use').toContain('<VideoSlot');
  });

  it('nothing REQUESTS YouTube until the button is pressed', () => {
    // Asserted against the SOURCE, not against dist/: a test that reads the
    // build output passes on a machine that has built and fails in CI, which is
    // exactly the mistake C3 made and CLAUDE.md warns about. (The built page is
    // checked in the browser at deploy time.)
    const slot = read('components/site/VideoSlot.astro');
    const markup = slot.slice(0, slot.indexOf('<script'));
    expect(markup, 'no iframe in the markup at all').not.toMatch(/<iframe/i);
    expect(markup, 'and no warm-up link to their origin').not.toMatch(/preconnect|dns-prefetch/i);
    // The embed URL exists only inside the click handler that builds it.
    const script = slot.slice(slot.indexOf('<script'));
    const embedAt = script.search(/youtube[^\s]*\/embed/i);
    expect(embedAt, 'the embed URL is in the script').toBeGreaterThan(-1);
    expect(script.slice(0, embedAt), 'and it is built inside a click listener')
      .toMatch(/addEventListener\(\s*'click'/);
  });

  it('and the flag removes it', () => {
    expect(home).toContain('{features.homeVideo && (');
    expect(typeof features.homeVideo).toBe('boolean');
  });
});

describe('the “why this is free” slot is plainly waiting for the operator', () => {
  it('is empty, and says so instead of inventing a reason', () => {
    expect(HOME.whyFree.body, 'the operator writes this himself').toBe('');
    expect(HOME.whyFree.placeholder).toMatch(/writing/i);
    expect(home).toContain("HOME.whyFree.body.trim() === ''");
  });

  it('the placeholder LOOKS like a placeholder', () => {
    expect(home).toContain('home-why-placeholder');
    expect(css).toMatch(/\.home-why-placeholder \{[\s\S]{0,120}font-style: italic/);
  });

  it('and the file tells the operator exactly which key to edit', () => {
    const cfg = read('config/home.ts');
    expect(cfg, 'the key is named in the file, next to the value').toContain('HOME.whyFree.body');
    expect(cfg).toContain('YOUR WORDS GO HERE');
    expect(cfg, 'and warns about the copy gate that would fail his build')
      .toMatch(/under 30 words/);
  });
});

describe('the footer is one centred object', () => {
  it('centred, in a column, in reading order', () => {
    const rule = footer.slice(footer.indexOf('.site-footer {'), footer.indexOf('}', footer.indexOf('.site-footer {')));
    expect(rule).toContain('text-align: center');
    expect(rule).toContain('align-items: center');
    expect(rule).toContain('flex-direction: column');
    const at = (n: string) => footer.indexOf(n);
    expect(at('footer-maker')).toBeLessThan(at('footer-contact'));
    expect(at('footer-contact')).toBeLessThan(at('<SocialMarks place="footer" />'));
    expect(at('<SocialMarks place="footer" />')).toBeLessThan(at('footer-links'));
    expect(at('footer-links'), 'the attributions come last').toBeLessThan(at('footer-legal'));
  });

  it('the required attributions are printed IN FULL, quietly', () => {
    expect(footer).toContain('{OGL_ATTRIBUTION}');
    expect(footer).toContain('{FOOTER.dataLicences}');
    expect(OGL_ATTRIBUTION.length, 'still the real thing').toBeGreaterThan(20);
    expect(FOOTER.dataLicences).toContain('Open Government Licence v3.0');
    expect(footer, 'quieter, never hidden').toMatch(/\.footer-legal \{[\s\S]{0,300}font-size: var\(--text-2xs\)/);
  });

  it('the as-of line and the stale-data note survived the rework', () => {
    expect(footer).toContain('data-asof-line');
    expect(footer).toContain('data-stale-note');
  });

  it('nothing became unreachable when the text links became marks', () => {
    expect(footer, 'terms and privacy are still links').toContain('href="/terms"');
    expect(footer).toContain('href="/privacy"');
    expect(marks, 'and the socials carry their accessible names').toContain('NAV.socials.instagram.label');
    expect(marks).toContain('NAV.socials.youtube.label');
  });
});

describe('the header shows the marks only where its row fits them', () => {
  it('the band is measured, not blanket', () => {
    // The first cut deleted the old ≤960px hide after measuring 320, 390 and
    // 1280 only. The header then wrapped to two rows on EVERY page across the
    // whole tablet-portrait range — 76px to 128px at 744, 768, 810, 820, 834.
    expect(marks).toContain('@media (max-width: 329px), (min-width: 641px) and (max-width: 860px)');
    expect(marks).toMatch(/\.social-marks-header \{ display: none; \}/);
  });

  it('the footer carries them at every width, so they are never unreachable', () => {
    expect(marks, 'no width hides the footer copy').not.toMatch(/social-marks-footer[^}]*display:\s*none/);
  });

  it('the header no longer tries to style them from outside the component', () => {
    const header = read('components/site/Header.astro');
    expect(header, 'a :global rule there loses on specificity and is dead code')
      .not.toContain(':global(.social-marks-header) { gap');
  });
});

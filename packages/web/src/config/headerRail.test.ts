import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ANALYSER_SECTIONS } from './analyserSections';

/**
 * The header and the left rail (C2), pinned.
 *
 * All three came from the operator looking at the analyser properly: the
 * wordmark and the maker credit not sharing a left edge, our own recolouring of
 * two other companies' marks, and a left rail that was two unrelated objects.
 */
const src = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string): string => readFileSync(`${src}${p}`, 'utf8');
const header = read('components/site/Header.astro');
const strip = read('components/analyser/SectionStrip.astro');
const css = read('styles/analyser.css');

/** Prose that explains a rule must be free to quote the thing it forbids. */
const strip_comments = (t: string): string =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the wordmark and the credit share a left edge', () => {
  it('the brand block aligns its children, and the mark is its own box', () => {
    // The artwork was 900x225 with 50px of transparent padding down its left
    // side, so at any render height the glyph began inside its own box while
    // the credit began at 0. The asset is cropped to the glyph now, so the
    // declared size IS the mark and flex-start is true rather than approximate.
    expect(header).toContain('align-items: flex-start');
    expect(header, 'the honest intrinsic size of the cropped asset').toContain('width="804" height="100"');
  });

  it('the gap between them is a spacing token, not a nudge', () => {
    const brand = header.slice(header.indexOf('.brand {'), header.indexOf('.brand-logo'));
    expect(brand).toContain('gap: var(--space-1)');
    expect(brand, 'no eyeballed pixel value').not.toMatch(/gap:\s*\d+px/);
  });
});

describe('the social marks are the official ones', () => {
  it('neither mark is recoloured — by attribute OR by stylesheet', () => {
    // Meta's and YouTube's brand guidelines both forbid recolouring. Ours were
    // lime, which was off-brand AND stopped them reading as the platforms.
    // The attribute check alone was not enough: a single CSS rule
    // (`.social-icon path { fill: var(--accent) }`) put the lime straight back
    // and passed. The stylesheet must not paint inside these marks at all.
    expect(header, 'a recoloured mark is an off-brand mark').not.toContain('fill="currentColor"');
    const style = header.slice(header.indexOf('<style>'));
    const painting = style.match(/\.social-icon[^{]*\{[^}]*\}/g) ?? [];
    for (const rule of painting) {
      expect(rule, 'the stylesheet must not colour somebody else’s mark').not.toMatch(/(^|[^-])fill\s*:/);
      expect(rule).not.toMatch(/(^|[^-])color\s*:/);
    }
    expect(style, 'and never reaches inside the artwork').not.toMatch(/\.social-icon\s+(path|rect|circle)/);
  });

  it('YouTube is YouTube red and Instagram carries ITS OWN gradient stops', () => {
    expect(header).toContain('fill="#FF0000"');
    // Naming the element was not enough — swapping a stop to lime kept the
    // element and passed. The stops themselves are the brand.
    for (const stop of ['#FFDD55', '#FF543E', '#C837AB', '#3771C8', '#6600FF']) {
      expect(header, `Instagram stop ${stop}`).toContain(stop);
    }
    expect(header, 'no brand lime inside either mark').not.toMatch(/stop-color="#dcff00"/i);
  });

  it('they are self-hosted — inline, with nothing fetched from a CDN', () => {
    // Comments stripped first: the file that explains there is no CDN must be
    // free to say the word.
    const socials = strip_comments(header.slice(header.indexOf('header-socials'), header.indexOf('<AuthHeader')));
    expect(socials).not.toMatch(/https?:\/\/(?!www\.instagram|www\.youtube)/);
    expect(socials, 'no external icon font or sprite').not.toMatch(/cdn|unpkg|jsdelivr|fontawesome/i);
  });

  it('the accessible labels survived', () => {
    expect(header).toContain('NAV.socials.instagram.label');
    expect(header).toContain('NAV.socials.youtube.label');
  });

  it('the lime hover chrome is gone — we do not paint our brand round theirs', () => {
    const socials = header.slice(header.indexOf('.header-socials a {'), header.indexOf('.social-icon {'));
    expect(socials).not.toContain('var(--accent)');
  });
});

describe('the left rail is ONE object', () => {
  const rail = css.slice(css.indexOf('THE LEFT RAIL: ONE OBJECT'), css.indexOf('main.page-wrap { padding-left'));

  it('one surface with one outline, and no gap between the two zones', () => {
    expect(rail).toContain('border-radius: 12px');
    expect(rail).toMatch(/gap:\s*0/);
  });

  it('its outline is NOT lime — lime marks only what you are in (C1)', () => {
    // --glass-border resolves to rgba(220,255,0,0.4); using it here would have
    // rebuilt the lime box C1 deliberately removed from the switcher.
    const outline = rail.slice(0, rail.indexOf('.strategy-seg'));
    expect(outline).not.toContain('var(--glass-border)');
    // The SHORTHAND must carry it: a redundant `border-bottom` used to satisfy
    // this while `border: 0` quietly removed the outline the rail depends on.
    expect(outline, 'the rail keeps a real outline').toMatch(/border:\s*1px solid rgba\(255, 255, 255, 0\.16\)/);
  });

  it('the zones are joined by a hairline, not separated by space', () => {
    expect(rail).toMatch(/\.section-strip\s*\{[^}]*border-top:\s*1px solid rgba\(255, 255, 255, 0\.16\)/);
  });

  it('the strategies are left-aligned, so the rail has a text edge at all', () => {
    // They were centred while the sections were left-aligned — the half of the
    // problem that is felt before it is named.
    expect(rail).toContain('justify-content: flex-start');
    expect(rail, 'the inset that puts strategy text on the label spine')
      .toContain('padding-left: calc(var(--space-3) + 16px + var(--space-2))');
  });

  it('the active section is marked by more than colour alone', () => {
    expect(rail).toContain("aria-current='true'");
    expect(rail, 'a solid left edge, not just a tint').toContain('inset 2px 0 0 var(--accent)');
  });
});

describe('every icon has a text label beside it', () => {
  it('every section names an icon, and every icon exists as a shape', () => {
    for (const s of ANALYSER_SECTIONS) {
      expect(s.icon, `${s.id} names an icon`).toBeTruthy();
      expect(strip, `${s.icon} is drawn`).toContain(`${s.icon}:`);
    }
  });

  it('the icon is decorative and the label always renders', () => {
    expect(strip).toContain('<span class="chip-label">{s.label}</span>');
    const svg = strip.slice(strip.indexOf('<svg class="chip-icon"'), strip.indexOf('</svg>'));
    expect(svg, 'never announced').toContain('aria-hidden="true"');
    expect(svg).toContain('focusable="false"');
  });

  it('the icon is a 16px marker, drawn ONLY in the desktop rail', () => {
    // Unasserted before: making it 40px and visible put icons in the phone's
    // horizontal strip, eating the width the labels need, and passed.
    expect(css).toMatch(/\.chip-icon\s*\{[^}]*width:\s*16px/);
    expect(css).toMatch(/\.chip-icon\s*\{[^}]*display:\s*none/);
    const rail = css.slice(css.indexOf('THE LEFT RAIL: ONE OBJECT'), css.indexOf('main.page-wrap { padding-left'));
    expect(rail, 'and turned on only inside the rail').toMatch(/\.chip-icon\s*\{\s*display:\s*block/);
  });

  it('the shapes are ours: no icon library, no font, no CDN', () => {
    expect(strip_comments(strip)).not.toMatch(/cdn|unpkg|jsdelivr|fontawesome|lucide|feather/i);
    const icons = strip.slice(strip.indexOf('const ICONS'), strip.indexOf('};', strip.indexOf('const ICONS')));
    // one stroke weight for the set, so the column reads as a set
    expect(strip).toContain('stroke-width="1.5"');
    expect(icons.match(/'/g)?.length).toBeGreaterThan(8);
  });
});

describe('the marks render at the size they always did', () => {
  const footer = read('components/site/Footer.astro');

  it('the header wordmark keeps its optical size at both breakpoints', () => {
    // The crop removed the box, so the render height had to come down with it:
    // the old 38px box held a 16.9px mark, the old 30px box a 13.3px one.
    expect(header).toMatch(/\.brand-logo\s*\{[^}]*height:\s*17px/);
    expect(header, 'and the small-screen override moved too').toMatch(/\.brand-logo\s*\{\s*height:\s*13px/);
  });

  it('the FOOTER wordmark keeps its optical size, derived from the CSS not the attributes', () => {
    // This is where the arithmetic went wrong first: 37px came from the tag's
    // stale width/height (88x50) rather than the 44px that actually rendered,
    // which made the maker credit 13% bigger. 218/293 x 44 = 32.74.
    expect(footer).toMatch(/\.footer-maker img\s*\{[^}]*height:\s*33px/);
    expect(footer, 'the attributes tell the truth about the file now')
      .toContain('width="499" height="218"');
  });
});

describe('the header reserves the space its late island needs', () => {
  it('so hydration cannot move the page', () => {
    // Cropping the wordmark shortened the brand block, which had been setting
    // the header's height; the client:idle auth control then started moving
    // everything below it. CLS went 0 -> 0.011 until this reserved the row.
    const at = header.indexOf('.header-right {');
    const right = header.slice(at, at + 600);
    expect(right).toContain('min-height: 2.75rem');
  });
});

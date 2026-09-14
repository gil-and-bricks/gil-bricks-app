/**
 * DP1 — IT COMES OUT AS CLEAN MULTI-PAGE A4, WITH THEIR COLOUR ON IT.
 *
 * WHAT THIS CAN AND CANNOT PROVE, said honestly. A stylesheet assertion is not
 * a printer. What it does prove is the chain: the accent the user chose is
 * really on the element as a custom property, the sheets really use that
 * property, the page box is really A4 with no margin of its own, each sheet
 * really breaks after itself and the last one does not, and the print rules
 * really hide the builder while showing the sheets. The pixels themselves are
 * checked by opening a real pack in a real browser — see docs/DECISIONS_LOG.md.
 *
 * THE COLOUR RULE IS THE ONE THAT SILENTLY BREAKS. Browsers drop backgrounds
 * and colours when printing unless asked not to. Without print-color-adjust the
 * accent rule under every heading — the one thing that makes the document
 * theirs — comes out of the printer blank, and nothing on screen ever says so.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render } from 'preact-render-to-string';
import { PackDocument } from './PackDocument';
import { packModel } from '../../fixtures/packModel';

/** The shipped stylesheet itself. Read from disk: vitest stubs CSS imports to
 *  an empty string, and every assertion below would then pass on nothing. */
const CSS = readFileSync(fileURLToPath(new URL('../../styles/pack.css', import.meta.url)), 'utf8');
/** One rule's body, by selector. Null when the selector is not in the file. */
/** One rule's body, by selector. Whitespace-tolerant: the stylesheet aligns
 *  its short declarations in columns, so "selector {" is not always literal. */
const rule = (selector: string): string | null => {
  const re = new RegExp(`(^|[},])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm');
  const m = re.exec(CSS);
  return m === null ? null : m[2];
};
/** Sheets, counted exactly: `pk-page-body` shares the prefix and must not count. */
const sheetCount = (html: string): number => (html.match(/class="pk-page[ "]/g) ?? []).length;

const ACCENT = '#8a1f4b';
const html = (): string => render(<PackDocument model={packModel()} />);

describe('the sheets', () => {
  it('are six A4 pages, each one its own section', () => {
    expect(CSS.length, 'the stylesheet was not read').toBeGreaterThan(2000);
    expect(sheetCount(html())).toBe(6);
    expect((html().match(/<section class="pk-page[ "]/g) ?? []).length).toBe(6);
  });

  it('are sized A4 in the stylesheet, not by a guess at the viewport', () => {
    const root = rule('.pk');
    expect(root, '.pk has no rule').not.toBeNull();
    expect(root).toContain('--pk-sheet-w: 210mm');
    expect(root).toContain('--pk-sheet-h: 297mm');
    const page = rule('.pk-page');
    expect(page, '.pk-page has no rule').not.toBeNull();
    expect(page).toContain('width: var(--pk-sheet-w)');
    expect(page).toContain('height: var(--pk-sheet-h)');
  });

  it('sit in an A4 page box that adds no margin of its own', () => {
    // A @page margin PLUS the sheet's own padding is what produces a lopsided
    // gutter — the sheet carries the padding, so the page box carries none.
    const page = CSS.slice(CSS.indexOf('@page'), CSS.indexOf('}', CSS.indexOf('@page')));
    expect(page).toContain('size: A4 portrait');
    expect(page).toMatch(/margin:\s*0/);
  });

  it('each break after themselves, and the last one does not', () => {
    const print = CSS.slice(CSS.indexOf('@media print'));
    expect(print).toMatch(/\.pk-page\b[^}]*break-after:\s*page/s);
    expect(print).toMatch(/\.pk-page:last-child\s*\{\s*break-after:\s*auto/);
  });

  it('never let a figure or the compliance block straddle a break', () => {
    const print = CSS.slice(CSS.indexOf('@media print'));
    for (const sel of ['.pk-fig', '.pk-compliance', '.pk-strip-item', '.pk-comps li']) {
      expect(print, sel).toContain(sel);
    }
    expect(print).toMatch(/break-inside:\s*avoid/);
  });
});

describe('the builder does not print', () => {
  it('hides the app’s own chrome and the controls, and shows the sheets', () => {
    const print = CSS.slice(CSS.indexOf('@media print'));
    expect(print).toMatch(/\.pk-composer\s*>\s*\*[^{]*\{[^}]*display:\s*none/s);
    expect(print).toMatch(/\.pk-pages[\s\S]{0,120}display:\s*block/);
  });

  it('puts the sheets on white paper, not on the app’s dark background', () => {
    const print = CSS.slice(CSS.indexOf('@media print'));
    // The composer's dark ground must not print behind the sheets.
    expect(print).toMatch(/background:\s*#fff\s*!important/);
    expect(print).toContain('.pk-preview');
  });
});

describe('their accent colour', () => {
  it('reaches the document as a custom property, from the profile', () => {
    expect(html()).toContain(`--pk-accent:${ACCENT}`);
  });

  it('is the property every heading and rule actually reads', () => {
    // A colour set but never read is the shape this catches. The cover TITLE is
    // deliberately not one of these: a headline in an arbitrary colour chosen
    // from a picker is the one place this could come out unreadable, so the
    // title stays black and the rule beneath it carries their colour.
    // The title itself is INK, deliberately: a headline in an arbitrary colour
    // from a picker is the one place this could come out unreadable. Their
    // colour carries the eyebrow, the rule, the section numeral and the hero.
    for (const sel of ['.pk-eyebrow', '.pk-rule', '.pk-opener-num', '.pk-hero-fig']) {
      const body = rule(sel);
      expect(body, `${sel} has no rule`).not.toBeNull();
      expect(body, sel).toContain('var(--pk-accent)');
    }
  });

  it('falls back to a neutral default rather than to nothing', () => {
    const neutral = render(<PackDocument model={packModel({
      branding: { businessName: 'A', accentColour: '', onAccent: '#ffffff', logoDataUri: '', duotone: false },
    })} />);
    expect(neutral).not.toContain('--pk-accent:');
    // The fallback is a real colour, not nothing: an unbranded pack has to look
    // deliberate rather than unfinished.
    expect(rule('.pk')).toMatch(/--pk-accent:\s*#[0-9a-f]{6}/i);
  });

  it('refuses anything that is not a plain hex colour', () => {
    // A value going straight into a style attribute is an injection surface.
    const nasty = render(<PackDocument model={packModel({
      branding: { businessName: 'A', accentColour: 'red; background:url(https://evil.example/x)', onAccent: '#ffffff', logoDataUri: '', duotone: false },
    })} />);
    expect(nasty).not.toContain('evil.example');
    expect(nasty).not.toContain('--pk-accent:');
  });

  it('survives the printer — both spellings of print-color-adjust', () => {
    const print = CSS.slice(CSS.indexOf('@media print'));
    expect(print).toContain('-webkit-print-color-adjust: exact');
    // NOT toContain: the unprefixed name is a SUBSTRING of the prefixed one, so
    // a plain contains passes with only the -webkit- line present — which is
    // exactly the half that Chrome and Firefox ignore.
    expect(print).toMatch(/(?:^|[^-])print-color-adjust:\s*exact/m);
  });
});

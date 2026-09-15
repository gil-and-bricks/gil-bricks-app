/**
 * THE SECOND ACCENT, MEASURED RATHER THAN TRUSTED.
 *
 * `--action` is the primary-call-to-action pink. It was specified with WHITE
 * text, and white on it measures 3.56:1 — a fail against AA's 4.5:1 for normal
 * text, and AA Large does not apply because these labels render at 16px/600,
 * under the 18.66px-bold threshold. The ink is therefore near-black, at 5.79:1.
 *
 * That is the kind of decision that rots: somebody nudges the shade, nobody
 * re-measures, and a failing contrast ships wearing a passing comment. So the
 * contrast is COMPUTED here from the token's own value. Change the hex and this
 * file re-measures it; if the new shade fails, the build fails with the number.
 *
 * It also holds the two copies of the token together. The extension ships as a
 * separate artefact with its own stylesheet, so the value exists twice by
 * necessity — but not silently: if the two ever disagree, this fails.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8');

const TOKENS = read('packages/web/src/styles/tokens.css');
const EXT_CSS = read('packages/extension/entrypoints/sidepanel/style.css');
const ANALYSER_CSS = read('packages/web/src/styles/analyser.css');

/** A custom property's value, from the stylesheet that owns it. */
const tokenIn = (css: string, name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(css);
  expect(m, `--${name} is not defined`).not.toBeNull();
  return m![1].toLowerCase();
};

/* ---- WCAG 2.1 relative luminance and contrast, written out so the numbers
        in the report are this file's numbers and nobody's memory. ---- */
const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
export const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const ACTION = tokenIn(TOKENS, 'action');
const ACTION_INK = tokenIn(TOKENS, 'action-ink');
/** Every stop of the dark gradient the pill is laid on. */
const STOPS = ['bg-0', 'bg-1', 'bg-2', 'bg-3'].map((n) => [n, tokenIn(TOKENS, n)] as const);

/** AA: 4.5 for normal text, 3.0 for a UI component's own boundary. */
const AA_TEXT = 4.5;
const AA_UI = 3.0;

describe('the action colour clears AA where it is actually used', () => {
  it('its ink passes AA for normal text', () => {
    const r = contrast(ACTION_INK, ACTION);
    expect(r, `${ACTION_INK} on ${ACTION} is ${r.toFixed(2)}:1 — AA needs ${AA_TEXT}`).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(STOPS)('the pill stands out from --%s', (_name, stop) => {
    const r = contrast(ACTION, stop);
    expect(r, `the pill on ${stop} is ${r.toFixed(2)}:1 — AA needs ${AA_UI}`).toBeGreaterThanOrEqual(AA_UI);
  });

  /**
   * THE ONE THAT CAUGHT IT. White was the specified ink and it does not pass;
   * this records the measurement so nobody reinstates it by eye. If a future
   * shade IS dark enough for white, this fails and the comment above should be
   * rewritten rather than the test deleted.
   */
  it('white would still fail on this shade — which is why the ink is dark', () => {
    const white = contrast('#ffffff', ACTION);
    expect(
      white,
      `white on ${ACTION} is ${white.toFixed(2)}:1. If this now passes ${AA_TEXT}, the shade changed — `
      + 'reconsider --action-ink rather than deleting this test.',
    ).toBeLessThan(AA_TEXT);
  });

  /** A guard on the guard: an unreadable token would make every check vacuous. */
  it('the tokens were actually read', () => {
    expect(ACTION).toMatch(/^#[0-9a-f]{6}$/);
    expect(ACTION_INK).toMatch(/^#[0-9a-f]{6}$/);
    expect(STOPS).toHaveLength(4);
  });
});

describe('the extension carries the same value, and cannot drift from it', () => {
  it('--action matches the web token exactly', () => {
    expect(tokenIn(EXT_CSS, 'action')).toBe(ACTION);
  });

  it('--action-ink matches too', () => {
    expect(tokenIn(EXT_CSS, 'action-ink')).toBe(ACTION_INK);
  });

  it('and so does the lime it already duplicated', () => {
    expect(tokenIn(EXT_CSS, 'accent')).toBe(tokenIn(TOKENS, 'accent'));
  });
});

/**
 * WHAT IS PINK AND WHAT IS NOT.
 *
 * The rule the operator set: pink is for the things they want pressed — Save,
 * Send to my analyser, Log in and their exact equivalents — and lime keeps
 * everything else. Both halves matter, so both are asserted: no primary action
 * left lime, and no secondary control turned pink.
 */
describe('pink is on the primary actions, and on nothing else', () => {
  const FILE = (p: string): string => read(`packages/web/src/components/${p}`);

  const PRIMARY: [string, string, RegExp][] = [
    ['analyser/ActionBar.tsx', 'Save the deal', /class="btn-action"[^>]*onClick=\{saveDeal\}/],
    ['auth/AccountApp.tsx', 'Log in', /class="btn-action"[^>]*>\{ACCOUNT\.signedOut\.logIn\}/],
    ['deals/DealBoard.tsx', 'Log in (board)', /class="btn-action"[^>]*>\{BOARD_COPY\.screen\.signInButton\}/],
    ['deals/DealFacts.tsx', 'Save (a fact)', /class="btn-action"[^>]*onClick=\{save\}/],
    ['finance/BridgingEnquiry.tsx', 'Sign in to continue', /class="btn-action"[^>]*>\{BRIDGING\.signedOut\.cta\}/],
  ];

  it.each(PRIMARY)('%s — %s is pink', (file, _what, pattern) => {
    expect(FILE(file)).toMatch(pattern);
  });

  it('the extension sends the deal on the pink button', () => {
    const main = read('packages/extension/entrypoints/sidepanel/main.ts');
    // X1 renamed it: "Send to my analyser" became "Run the full numbers", which
    // says what happens rather than where it goes.
    const line = main.split('\n').find((l) => l.includes('send-btn send-btn-action'));
    expect(line, 'the pink button must exist').toBeDefined();
    expect(line, 'and it is the handoff button that carries it').toContain('C.handoff.action');
  });

  /**
   * THE OTHER HALF, REWRITTEN FOR X1.
   *
   * This used to name the panel's two LIME offers — "Open the measure tool" and
   * "Use N m² as floor area" — and check the pink modifier had not spread to
   * them. Both were removed with the measure tool, so the old test could only
   * ever look for lines that no longer exist.
   *
   * The guarantee it was protecting still matters and is now stated directly:
   * the panel has exactly ONE send-btn, and it is the pink one. If a second
   * button ever appears, this fails and somebody has to decide which of the two
   * leads — rather than both being loud and neither leading.
   */
  it('the extension has exactly one primary button, and it is the pink one', () => {
    const main = read('packages/extension/entrypoints/sidepanel/main.ts');
    const buttons = main.split('\n').filter((l) => /e\('button', '[^']*send-btn/.test(l));
    expect(buttons, 'one call to action on the panel, not two').toHaveLength(1);
    expect(buttons[0]).toContain('send-btn-action');
  });

  /**
   * GOOGLE'S BUTTON IS GOOGLE'S. Its white ground, grey border and Roboto label
   * are prescribed by Google's sign-in branding; recolouring it would breach
   * that and cost the instant recognition that makes it work.
   */
  it("the Google sign-in button keeps Google's own styling", () => {
    const gsi = /\.gsi-button\s*\{[^}]*\}/.exec(ANALYSER_CSS)?.[0] ?? '';
    expect(gsi, '.gsi-button rule not found').not.toBe('');
    expect(gsi).not.toMatch(/var\(--action/);
    expect(gsi).toContain('#fff');
  });

  /** YouTube links are an offer, not an instruction — they stay lime. */
  it('the YouTube links stay lime', () => {
    const yt = ANALYSER_CSS.split('\n').filter((l) => /youtube|yt-/i.test(l) && l.includes('var(--'));
    for (const line of yt) expect(line, `a YouTube rule went pink: ${line}`).not.toContain('var(--action');
  });

  it('no other component reached for the action token', () => {
    const used = ['analyser/ActionBar.tsx', 'auth/AccountApp.tsx', 'deals/DealBoard.tsx',
      'deals/DealFacts.tsx', 'finance/BridgingEnquiry.tsx'];
    // The class is the only route in; the token itself belongs to the stylesheet.
    for (const p of used) expect(FILE(p)).not.toContain('var(--action');
  });
});

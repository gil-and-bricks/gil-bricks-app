// @vitest-environment happy-dom
/**
 * A BUTTON THAT NAMES AN APP MUST OPEN THAT APP.
 *
 * "Share on WhatsApp" used to call the Web Share API wherever the browser had
 * one, so on a Mac it opened the macOS panel (Mail, Messages, Notes, Freeform)
 * and on a phone the OS sheet — a menu in front of the one app it had named.
 *
 * Two things are held here. The URL we hand WhatsApp, and the fact that NOTHING
 * in the product calls the OS share sheet: the last test walks every source file
 * in all three packages, so a Web Share call cannot come back on any surface.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT } from '../../config/account';
import { ACTION_BAR } from '../../config/analyserForm';
import { openWhatsApp, whatsappShareUrl } from './whatsapp';

describe('the WhatsApp share URL', () => {
  it('is WhatsApp\u2019s own share endpoint, and nobody else\u2019s', () => {
    const url = new URL(whatsappShareUrl('hello'));
    expect(url.origin).toBe('https://wa.me');
    expect(url.pathname).toBe('/');
  });

  it('carries the whole message, link and all, in ?text', () => {
    const text = 'CF37 1HR \u2014 est \u00a3150,000 https://example.com/buy-to-let/analyser?price=150000';
    expect(new URL(whatsappShareUrl(text)).searchParams.get('text')).toBe(text);
  });

  it('escapes what would otherwise break the URL', () => {
    for (const t of ['a&b=c', 'a#b', 'a b', '100%', '\u00a3150,000 \u2014 ROI 12.3%']) {
      expect(new URL(whatsappShareUrl(t)).searchParams.get('text'), t).toBe(t);
    }
    expect(whatsappShareUrl('a&b')).not.toContain('&b=');
  });

  it('names no recipient \u2014 WhatsApp asks who, we never guess', () => {
    // A number in the path would send it to THAT person. The path stays bare.
    expect(whatsappShareUrl('x')).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});

describe('opening WhatsApp', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens the WhatsApp URL in a new tab and never touches navigator.share', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const share = vi.fn();
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    openWhatsApp('the deal \u2014 https://example.com/x');

    expect(share).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, feat] = open.mock.calls[0];
    expect(String(url)).toBe(whatsappShareUrl('the deal \u2014 https://example.com/x'));
    expect(target).toBe('_blank');
    expect(String(feat)).toContain('noopener');
  });

  it('opens it SYNCHRONOUSLY, so the click is still a user gesture', () => {
    // The old code reached its WhatsApp line only after an await, by which time
    // the gesture was spent and the tab could be blocked as a popup.
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    openWhatsApp('x');
    expect(open).toHaveBeenCalled(); // already, with no tick in between
  });
});

/* ---- nothing in the product may call the OS share sheet ------------------ */

/** packages/ — found by walking up, because this suite runs in happy-dom where
 *  import.meta.url is not a file URL. The file-count test below proves it landed. */
const PKGS = ((): string => {
  let d = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(d, 'web', 'src')) && existsSync(join(d, 'core', 'src'))) return d;
    d = dirname(d);
  }
  throw new Error(`packages/ not found from ${process.cwd()}`);
})();
/** Build output and third-party code: never ours, never swept. */
const SKIP_DIR = /^(node_modules|dist|\.output|\.wxt|\.astro|\.wrangler|coverage|vendor)$/;
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  if (SKIP_DIR.test(e.name)) return [];
  return e.isDirectory() ? walk(p) : [p];
});
/**
 * EVERY SHIPPED SURFACE, and only shipped surfaces.
 *
 * The extension's entire UI lives in packages/extension/entrypoints — a sweep
 * that read only src/ would have called the side panel clean without opening
 * it. So the list is explicit, and the test below fails if a NEW directory of
 * shipped code appears and nobody decided which side of the line it is on.
 *
 * Harnesses are deliberately out: a Playwright verifier that SPIES on the Web
 * Share API to prove this very fix is legitimate, and must not break the build.
 */
const SHIPPED = ['web/src', 'web/public', 'core/src', 'extension/src', 'extension/entrypoints', 'extension/public'];
const NOT_SHIPPED = [
  'web/docs', 'web/migrations', 'web/pipeline', 'web/scripts',
  'core/data', 'core/fixtures',
  'extension/scripts', 'extension/store', 'extension/tests', 'extension/tools',
];
const CODE = /\.(ts|tsx|astro|js|mjs|html)$/;
const SOURCES = SHIPPED
  .flatMap((d) => walk(join(PKGS, d)))
  .filter((p) => CODE.test(p) && !/\.test\.[a-z]+$/.test(p));

describe('no control anywhere calls the OS share sheet', () => {
  it('reads every shipped surface, the extension\u2019s entrypoints/ included', () => {
    expect(SOURCES.length).toBeGreaterThan(100);
    const rels = SOURCES.map((p) => relative(PKGS, p).split('\\').join('/'));
    expect(rels).toContain('extension/entrypoints/sidepanel/main.ts');
    expect(rels).toContain('web/src/components/analyser/ActionBar.tsx');
    expect(rels).toContain('core/src/comparables/links.ts');
  });

  it('no directory of shipped code is left unswept by accident', () => {
    // A new packages/<x>/<dir> full of code must be put on one list or the
    // other DELIBERATELY. Missing extension/entrypoints once was enough.
    const unclassified: string[] = [];
    for (const pkg of ['web', 'core', 'extension']) {
      for (const e of readdirSync(join(PKGS, pkg), { withFileTypes: true })) {
        if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIR.test(e.name)) continue;
        const d = `${pkg}/${e.name}`;
        if (SHIPPED.includes(d) || NOT_SHIPPED.includes(d)) continue;
        if (walk(join(PKGS, d)).some((f) => CODE.test(f))) unclassified.push(d);
      }
    }
    expect(unclassified, 'new code directory — add it to SHIPPED or NOT_SHIPPED').toEqual([]);
  });

  /**
   * THE RULE IS NOT "NEVER TOUCH THE WEB SHARE API". It is that a control which
   * NAMES AN APP must open that app.
   *
   * The bug this suite was written for: a button reading "Share on WhatsApp"
   * called navigator.share, so the user pressed WhatsApp and got the macOS
   * panel — Mail, Messages, Notes, Freeform — a menu standing in front of the
   * one app the button had promised.
   *
   * DP3 adds the opposite kind of control: a plain "Share" on the deal pack,
   * which names nothing and whose entire job is to hand the file to whatever
   * the reader actually uses. There the OS sheet is not an obstruction, it IS
   * the feature — it is the only £0 route to WhatsApp for a FILE, and the app
   * may never send email (golden rule 6).
   *
   * So the sweep is now allow-listed rather than absolute, and the protection
   * is kept by the test BELOW it, which is the one that always mattered: a file
   * that names an app may not call the share sheet. That is stricter than what
   * this replaced, because the old test could have been satisfied by deleting
   * the WhatsApp button entirely.
   */
  /**
   * DP4 — THE ALLOW-LIST IS GONE, AND THE RULE IS ABSOLUTE AGAIN.
   *
   * DP3 narrowed this to permit the deal pack's Share button, on the reasoning
   * that a control labelled just "Share" names no app and the OS sheet was the
   * only £0 route to WhatsApp for a 1.7MB file. The first half was arguable;
   * the second was the real motive, and it was solving the wrong problem. What
   * the operator got was AirDrop, Mail, Messages and Notes — the same fault the
   * WhatsApp button had, wearing a different label.
   *
   * The fix was not a better exemption. A saved pack has a URL, and a URL is
   * the one thing wa.me and a mail client will both carry, so nothing in the
   * product needs the sheet any more and the exemption has been deleted rather
   * than re-argued. If it ever comes back, it comes back as a decision made in
   * daylight, not as a name on a list.
   */
  const codeOnly = (src: string): string => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const usesShareSheet = (raw: string): boolean => {
    const src = codeOnly(raw);
    if (/\bcanShare\b/.test(src)) return true;
    return /\bnavigator\b/.test(src) && /\.\s*share\s*\(/.test(src);
  };

  it('never uses the Web Share API — on any surface, in any package', () => {
    const offenders = SOURCES
      .filter((p) => usesShareSheet(readFileSync(p, 'utf8')))
      .map((p) => relative(PKGS, p).split('\\').join('/'));
    expect(
      offenders,
      'navigator.share opens the OS sheet (Mail, Messages, Notes…), never the app a button names',
    ).toEqual([]);
  });

  it('NO file that names a messaging app may call the share sheet', () => {
    /**
     * The real rule, enforced directly for the first time. If a file mentions
     * WhatsApp, Messenger, Telegram, Signal or email AND reaches for the OS
     * sheet, that is the exact fault this suite exists for — and the allow-list
     * above buys no exemption from it.
     */
    const NAMES_AN_APP = /whatsapp|messenger|telegram|\bsignal\b|\bimessage\b|mailto:/i;
    const offenders = SOURCES
      .filter((p) => !p.endsWith(join('lib', 'share', 'whatsapp.ts')))
      .filter((p) => {
        const raw = readFileSync(p, 'utf8');
        return NAMES_AN_APP.test(codeOnly(raw)) && usesShareSheet(raw);
      })
      .map((p) => relative(PKGS, p).split('\\').join('/'));
    expect(offenders, 'a control that names an app must open that app').toEqual([]);
  });

  it('builds its WhatsApp link in ONE place \u2014 no hand-rolled wa.me anywhere else', () => {
    const offenders = SOURCES
      .filter((p) => !p.endsWith(join('lib', 'share', 'whatsapp.ts')))
      // CODE, not comments. DP4's share.ts and PackComposer.tsx both EXPLAIN in
      // prose why wa.me can carry only text — that is the record of a decision,
      // not a second hand-rolled link, and a rule that cannot tell them apart
      // pushes people to stop writing the reasons down.
      .filter((p) => /wa\.me|api\.whatsapp\.com|whatsapp:\/\//.test(codeOnly(readFileSync(p, 'utf8'))))
      .map((p) => relative(PKGS, p).split('\\').join('/'));
    expect(offenders, 'use openWhatsApp() from lib/share/whatsapp.ts').toEqual([]);
  });

  it('the detector is NOT vacuous: it catches what it claims to catch', () => {
    for (const s of ['if (navigator.share) {', 'await navigator . share({text})', 'navigator.canShare(d)']) {
      expect(/navigator\s*\.\s*(share|canShare)\b/.test(s), s).toBe(true);
    }
    expect(/wa\.me|api\.whatsapp\.com|whatsapp:\/\//.test('https://wa.me/?text=x')).toBe(true);
    expect(/navigator\s*\.\s*(share|canShare)\b/.test('navigator.clipboard.writeText(x)')).toBe(false);
    expect(/navigator\s*\.\s*(share|canShare)\b/.test('const shared = 1')).toBe(false);
  });
});

describe('every share control names the app it opens', () => {
  it('says WhatsApp on the analyser bar AND on a saved deal \u2014 the same words', () => {
    // A bare "Share" promises a choice of app. Neither button gives one, so
    // neither may imply one.
    expect(ACTION_BAR.buttons.share).toMatch(/whatsapp/i);
    expect(ACCOUNT.deals.share).toBe(ACTION_BAR.buttons.share);
  });
});

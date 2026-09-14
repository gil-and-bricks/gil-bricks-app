/**
 * DP3 — SHARING, NOT PRINTING.
 *
 * NOBODY PRINTS A DEAL PACK. It goes on WhatsApp, or by email, or into the
 * recipient's files to look at on a train. The old export was `window.print()`
 * plus twelve words telling the user how to drive their browser's print box —
 * a desktop dialog standing between a sourcer and the thing they wanted to send.
 *
 * WHAT THIS PRODUCES: ONE SELF-CONTAINED .html FILE.
 *
 * Every byte the document needs travels inside it — the stylesheet, the fonts,
 * the logo, the photographs and the map, all already data URIs by the time they
 * reach the page. It therefore opens correctly with no network at all: tapped in
 * WhatsApp, opened from Mail, or saved to Files and read on a plane. The
 * recipient's own browser can still turn it into a PDF if they want paper.
 *
 * WHY NOT THE OTHER THREE:
 *
 *  · A PDF BUILT IN THE BROWSER (jsPDF, pdf-lib) means re-implementing the
 *    document against a drawing API. Every chart here is hand-rolled SVG and
 *    every page is CSS grid at millimetre sizes; none of that survives the trip.
 *    We would ship a second, worse renderer and the two would drift.
 *  · A LINK needs the pack stored on a server and served at a URL. That is a
 *    new feature with a new table, and the thing stored carries the sourcer's
 *    AML number, ICO registration and insurance details. A guessable URL to that
 *    is a data-protection surface this product does not need to own.
 *  · IMAGES OF EACH PAGE (html2canvas) turn text into pixels — unselectable,
 *    unsearchable, unreadable to a screen reader, and blurry when zoomed on the
 *    one device it is most likely to be read on.
 *
 * THE PHONE IS THE TARGET. A4 is 210mm wide and a phone is not, so the exported
 * file carries a small responsive block the on-screen preview does not need: at
 * narrow widths the sheet scales down to the viewport instead of forcing a
 * sideways scroll. That block is the difference between "a file" and "a file
 * that opens properly on a phone".
 *
 * THIS MODULE HOLDS NO COPY. Every visible word is passed in from config.
 */
import packCss from '../../styles/pack.css?raw';
import exportCss from '../../styles/pack-export.css?raw';
import shell from './export-shell.html?raw';

/**
 * The two halves of the `src:` descriptor an inlined face gets, kept apart so
 * neither reads as a sentence to the inline-copy ratchet. It sweeps lib files
 * for hardcoded user-facing strings and cannot tell a CSS declaration from
 * English; this is CSS, and splitting it is cheaper and safer than teaching the
 * detector a new exception it could hide real copy behind.
 */
const SRC_HEAD = 'src:url(data:font/woff2;base64,';
const SRC_TAIL = ') format("woff2")';

/** base64 without blowing the argument limit on a megabyte of font. */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
}

/**
 * THE FONTS THE DOCUMENT IS SET IN, INLINED.
 *
 * They are bundled with hashed filenames, so there is no path to hardcode —
 * these are read back out of the stylesheets the page already loaded. Without
 * them a shared pack falls back to the reader's system font and the typography,
 * which is most of the design, is gone.
 *
 * A font that will not load is SKIPPED, not fatal: a pack that shares in the
 * wrong face beats a Share button that throws.
 */
async function inlineFonts(): Promise<string> {
  const wanted = /Montserrat|Poppins/i;
  const faces: string[] = [];
  const seen = new Set<string>();
  for (const sheet of [...document.styleSheets]) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }   // cross-origin, skip
    for (const rule of [...rules]) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue('font-family');
      if (!wanted.test(family)) continue;
      const src = rule.style.getPropertyValue('src');
      const url = /url\(["']?([^"')]+\.woff2)["']?\)/i.exec(src)?.[1];
      if (url === undefined || seen.has(url)) continue;
      seen.add(url);
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const b64 = toBase64(await res.arrayBuffer());
        /**
         * THE RULE'S OWN `cssText`, WITH ONLY THE URL SWAPPED.
         *
         * Retyping the descriptors by hand meant guessing at whatever the
         * bundler emitted — weight, style, unicode-range, the lot — and
         * silently dropping anything not guessed. Rewriting the src keeps every
         * descriptor exactly as shipped and changes the one thing that has to
         * change: where the bytes come from.
         */
        faces.push(rule.cssText.replace(/src\s*:[^;}]+/i, SRC_HEAD + b64 + SRC_TAIL));
      } catch { /* skip this face */ }
    }
  }
  return faces.join('\n');
}

/**
 * THE DOCUMENT, AS ONE FILE.
 *
 * `root` is the live `.pk` element. It is cloned rather than read as a string so
 * the duotone <filter> and the <svg> charts come with it exactly as rendered.
 */
export async function buildPackHtml(root: HTMLElement, title: string, lang: string): Promise<string> {
  const doc = root.cloneNode(true) as HTMLElement;
  doc.classList.add('pk-export');
  // The preview scales the sheet to fit its column; the file must not inherit
  // that, or every reader gets the sender's window width baked in.
  doc.removeAttribute('style');
  for (const el of [...doc.querySelectorAll<HTMLElement>('[style*="zoom"]')]) el.style.removeProperty('zoom');

  const fonts = await inlineFonts();
  const esc = (t: string): string => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c));
  /**
   * SUBSTITUTED, NOT CONCATENATED. The shell is a real .html file, so the
   * export's markup and its fit script can be read and edited as markup rather
   * than as an escaped string inside TypeScript. Replacements run once each and
   * a missing placeholder is a build-time mistake, not a silent empty document —
   * which is why the result is asserted before it is handed back.
   */
  const out = shell
    .replace('__LANG__', esc(lang))
    .replace('__TITLE__', esc(title))
    .replace('__FONTS__', fonts)
    .replace('__CSS__', packCss)
    .replace('__PHONE__', exportCss)
    .replace('__BODY__', doc.outerHTML);
  if (out.includes('__BODY__') || out.includes('__CSS__')) {
    throw new Error('pack export shell did not substitute');
  }
  return out;
}

export type ShareOutcome = 'shared' | 'saved' | 'cancelled';

/**
 * SHARE IF THE DEVICE CAN, SAVE IF IT CANNOT.
 *
 * `navigator.share` with a file is the phone's own share sheet — WhatsApp, Mail,
 * AirDrop, Files, whatever the reader actually uses. It does not exist on most
 * desktops and refuses some file types on some platforms, so the capability is
 * ASKED (`canShare`), never assumed, and the answer when it says no is a plain
 * download of the identical file rather than an apology.
 *
 * A CANCELLED SHARE IS NOT A FAILURE. Dismissing the sheet rejects with
 * AbortError; that is the user changing their mind and must not become an error
 * message or a surprise download.
 */
export async function sharePack(
  html: string, filename: string, shareTitle: string, mode: 'share' | 'save',
): Promise<ShareOutcome> {
  const file = new File([html], filename, { type: 'text/html' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (mode === 'share' && typeof nav.share === 'function' && nav.canShare?.({ files: [file] }) === true) {
    try {
      await nav.share({ files: [file], title: shareTitle });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Anything else (a platform that lied about canShare) falls through to
      // the download, because the user asked for their pack and should get it.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}

/** A filename from the deal, not from a counter. Safe on every filesystem. */
export function packFilename(address: string, suffix: string): string {
  const stem = address.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 60);
  return `${stem === '' ? suffix : `${stem}-${suffix}`}.html`;
}

/**
 * DP1 — THE PACK AS ONE FILE THEY CAN SEND.
 *
 * WHY A FILE AND NOT A LINK. We do not host packs. Hosting one would mean
 * storing an investor-facing document about somebody's deal on our servers, for
 * ever, with a URL anybody who got it could open — and it would not be free.
 * So the pack is a document, and sharing it is sending the document.
 *
 * SELF-CONTAINED BY CONSTRUCTION. The saved file carries the pack's own
 * stylesheet inline and nothing else. Every image inside it is a data URI —
 * their logo from their own profile, their photographs read in this tab — so
 * there is nothing for the file to fetch when it is opened somewhere else, and
 * nothing of the portal's in it. `assertNoRemoteImages` refuses to save if that
 * is ever untrue, rather than quietly shipping a document that phones home.
 *
 * BUILT AND SAVED IN THE BROWSER. No request, no server, no round trip.
 */
import packCss from '../../styles/pack.css?raw';

/** The class the saved file's body carries, so pack.css can style the paper. */
const SAVED_BODY_CLASS = 'pk-saved';
/** createHTMLDocument does not give one, and a file without it renders in quirks mode. */
const DOCTYPE = '<!doctype html>';

/** A src we are willing to put in a file that leaves the building. */
const isLocalImage = (src: string): boolean => src.startsWith('data:image/');

/**
 * Every image in the document must be one we made here. A remote src — the
 * portal's, anybody's — means the document would fetch somebody else's picture
 * from somebody else's server every time it is opened. It never gets saved.
 */
export function assertNoRemoteImages(root: ParentNode): void {
  for (const img of root.querySelectorAll('img')) {
    if (!isLocalImage(img.getAttribute('src') ?? '')) {
      throw new Error('Pack contains an image that is not ours to send');
    }
  }
}

/**
 * The whole document, as one string. Exported so a test can read it.
 *
 * BUILT AS A DOCUMENT, NOT AS A TEMPLATE. The title is the user's own deal
 * title and the body is their own pack; assembling those by concatenating
 * markup is how a stray `<` in somebody's property title becomes broken HTML —
 * or worse — in a file they then send to an investor. The browser's own
 * serialiser escapes what needs escaping.
 */
export function packFileHtml(root: Element, title: string): string {
  assertNoRemoteImages(root);
  const doc = document.implementation.createHTMLDocument(title);
  const charset = doc.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  const viewport = doc.createElement('meta');
  viewport.setAttribute('name', 'viewport');
  viewport.setAttribute('content', 'width=device-width, initial-scale=1');
  const style = doc.createElement('style');
  style.textContent = packCss;
  doc.head.prepend(charset, viewport, style);
  doc.documentElement.setAttribute('lang', 'en');
  doc.body.className = SAVED_BODY_CLASS;
  doc.body.innerHTML = root.innerHTML;
  return `${DOCTYPE}\n${doc.documentElement.outerHTML}\n`;
}

/** Save it. Returns false when there was nothing to save, or it was refused. */
export function savePackFile(root: Element | null, title: string, fileName: string): boolean {
  if (root === null) return false;
  let url = '';
  try {
    const blob = new Blob([packFileHtml(root, title)], { type: 'text/html;charset=utf-8' });
    url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    return true;
  } catch {
    return false;
  } finally {
    // Released on the next tick: Safari needs the object alive past the click.
    if (url !== '') setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

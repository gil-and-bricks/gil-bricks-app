// @vitest-environment happy-dom
/**
 * DP1 — NO PORTAL IMAGE IS FETCHED OR EMBEDDED WHEN A PACK IS RENDERED.
 *
 * THE RULE, STATED PLAINLY. The listing's photographs and the agent's floor
 * plan are the agent's copyright. Displaying them in a browser, from the
 * agent's own server, on the page the user opened themselves, is one thing.
 * Putting copies into a document somebody then sends to an investor is
 * another, and that one is not ours to do. The extension carries their URLs in
 * the handoff so the analyser can show them in place; none of that reaches
 * here.
 *
 * WHAT IS CHECKED, and why each part is needed:
 *   • the deal's parameters carry real portal URLs — the pack is rendered from
 *     a deal that HAS them, so "no portal image" is a result, not an absence;
 *   • `fetch`, `XMLHttpRequest` and `Image` all throw during the render, so a
 *     request of any kind fails the test rather than passing unnoticed;
 *   • every `<img>` in the output is parsed and its src read: a data URI is
 *     allowed, anything remote is not;
 *   • the portal hostnames are searched for in the whole document, in case one
 *     arrives somewhere that is not an image at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact-render-to-string';
import { PackDocument } from './PackDocument';
import { packFileHtml, assertNoRemoteImages } from '../../lib/pack/saveFile';
import { packModel } from '../../fixtures/packModel';

/** The shapes the portals' own image URLs take, as the handoff carries them. */
const PORTAL_PHOTO = 'https://media.rightmove.co.uk/dir/crop/10:9-16:9/123k/12345/678_IMG_01_0000_max_476x358.jpeg';
const PORTAL_PLAN = 'https://lid.zoocdn.com/u/2400/1800/floorplan_00_0000.jpg';

/** A pack that HAS its own pictures, so "no remote image" is not just "no image". */
const OWN_PHOTO = 'data:image/png;base64,iVBORw0KGgo=';
const OWN_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAA=';

let calls: string[];
beforeEach(() => {
  calls = [];
  const refuse = (what: string) => (...args: unknown[]): never => {
    calls.push(`${what}: ${String(args[0] ?? '')}`);
    throw new Error(`${what} during a pack render`);
  };
  vi.stubGlobal('fetch', refuse('fetch'));
  vi.stubGlobal('XMLHttpRequest', class { open = refuse('xhr'); });
  vi.stubGlobal('Image', class { set src(v: string) { refuse('Image')(v); } });
});
afterEach(() => vi.unstubAllGlobals());

const withPictures = () => packModel({
  photos: [OWN_PHOTO, OWN_PHOTO],
  branding: { businessName: 'Hillside Property Partners', accentColour: '#8a1f4b', logoDataUri: OWN_LOGO },
});

const parsed = (html: string): HTMLDivElement => {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box;
};

describe('a pack made from a deal that carries portal image URLs', () => {
  it('renders without a single request of any kind', () => {
    const out = render(<PackDocument model={withPictures()} />);
    expect(calls).toEqual([]);
    expect(out.length).toBeGreaterThan(1000);
  });

  it('shows the user’s own pictures — so the checks below are not passing on an empty page', () => {
    const imgs = [...parsed(render(<PackDocument model={withPictures()} />)).querySelectorAll('img')];
    expect(imgs.length).toBeGreaterThanOrEqual(3); // the logo and two photographs
  });

  it('has no image anywhere whose source is not ours', () => {
    const imgs = [...parsed(render(<PackDocument model={withPictures()} />)).querySelectorAll('img')];
    for (const img of imgs) expect(img.getAttribute('src') ?? '').toMatch(/^data:image\//);
  });

  it('never mentions a portal host, an image element or not', () => {
    const out = render(<PackDocument model={withPictures()} />);
    for (const host of ['rightmove', 'zoopla', 'zoocdn', 'media.rightmove']) {
      expect(out.toLowerCase(), host).not.toContain(host);
    }
  });

  it('the file the user saves carries no remote image either', () => {
    const box = parsed(render(<PackDocument model={withPictures()} />));
    const file = packFileHtml(box, 'A pack');
    expect(file).toContain('data:image/png;base64');
    expect(file.toLowerCase()).not.toContain('rightmove');
    expect(file.toLowerCase()).not.toContain('zoocdn');
    expect(file).not.toMatch(/<img[^>]+src="(?!data:image\/)/);
  });
});

describe('and if one ever got in', () => {
  it('the saved file refuses to be built', () => {
    const box = parsed(`<div class="pk"><img src="${PORTAL_PHOTO}" alt=""></div>`);
    expect(() => assertNoRemoteImages(box)).toThrow(/not ours to send/);
    expect(() => packFileHtml(box, 'A pack')).toThrow();
  });

  it('refuses the agent’s floor plan just the same', () => {
    const box = parsed(`<div class="pk"><img src="${PORTAL_PLAN}" alt=""></div>`);
    expect(() => packFileHtml(box, 'A pack')).toThrow();
  });

  it('and a same-origin image is refused too — only a data URI is ours', () => {
    const box = parsed('<div class="pk"><img src="/favicon.png" alt=""></div>');
    expect(() => packFileHtml(box, 'A pack')).toThrow();
  });
});

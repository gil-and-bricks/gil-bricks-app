/**
 * X2 — THE CHIPS ON THE PORTAL'S OWN PAGE.
 *
 * ── AN IDENTIFIER, NOT A LESSON ─────────────────────────────────────────────
 * Two or three words, a colour, and an icon. Tap one and it gives ONE short
 * line of why, and nothing more. There are no paragraphs here, because a page
 * somebody else owns is the worst possible place to repeat ourselves.
 *
 * ── IT MUST BE OBVIOUSLY OURS ───────────────────────────────────────────────
 * A box on their page carries more apparent authority than one in our own
 * panel, and could be taken for the portal's own content. That would be
 * dishonest and it is against Chrome's rules. So every group carries the
 * product's mark, in our colours, and says nothing in a voice that could be
 * mistaken for Rightmove's or Zoopla's.
 *
 * ── NOTHING WE INJECT MAY TOUCH THEIR PAGE ──────────────────────────────────
 * Every group lives in a CLOSED shadow root. Their CSS cannot reach in, ours
 * cannot leak out, and `closed` means their scripts cannot reach into ours
 * either. The host element is inline-block and carries no layout of its own
 * beyond its own box, so their grid never reflows around us.
 *
 * ── AND THEIR MARKUP WILL CHANGE ────────────────────────────────────────────
 * Assume it. Anchors are the most stable things on each page — Rightmove's
 * data-testid attributes, Zoopla's semantic section plus the visible label text
 * — never a hashed class name. When an anchor is not found, the chip falls back
 * into the one box under the photographs rather than guessing a position or
 * disappearing silently. When even that is missing, the box goes at the top of
 * the main content. There is no path here that drops a finding on the floor.
 */
import {
  FINDING_COPY, FINDINGS_COPY, FINDING_TONE, FINDING_ICON, PRICE_LINE,
  type Finding, type FindingAnchor, type Portal, type BandOutcome,
} from '@gil-bricks/core';

export const CHIPS_ROOT_ATTR = 'data-gb-chips';
/** One per anchored group, plus one for the box. Used to find and remove ours. */
export const CHIP_HOST_TAG = 'gb-findings';

/**
 * WHERE TO LOOK, PER PORTAL, IN ORDER OF PREFERENCE.
 *
 * Config-shaped so a portal redesign is one edit here rather than a hunt
 * through the rendering code. Every selector is chosen for stability:
 *
 *   RIGHTMOVE publishes data-testid attributes on the things people use —
 *     the tenure line, the EPC block, the size, the photo collage. Those are
 *     written for their own automated tests, which is exactly what makes them
 *     outlive a restyle.
 *
 *   ZOOPLA publishes almost none on its content — its testids are ads, scripts
 *     and chrome. What it does have is a semantically labelled section,
 *     `section[aria-labelledby="key-info"]`, holding a list whose items are
 *     titled in plain visible words. So Zoopla is anchored by MEANING and TEXT,
 *     which is the most stable thing it offers. Its gallery has no stable hook
 *     at all, so its box falls back — by design, not by accident.
 */
export const ANCHORS: Record<Portal, { byTestId?: Partial<Record<FindingAnchor | 'photos', string>>; keyInfo?: string; keyInfoLabels?: Partial<Record<FindingAnchor, string[]>>; photos?: string[] }> = {
  rightmove: {
    byTestId: {
      tenure: '[data-testid="info-reel-tenure-button"]',
      epc: '[data-testid="energy-performance-certificate"]',
      area: '[data-testid="info-reel-SIZE-text"]',
      photos: '[data-testid="photo-collage"]',
    },
    // Rightmove shows council tax and lease terms inside the same block as the
    // EPC; there is no separate hook, so those chips sit with it.
    keyInfoLabels: { councilTax: [], lease: [] },
    photos: ['[data-testid="photo-collage"]', 'main h1', 'main'],
  },
  zoopla: {
    keyInfo: 'section[aria-labelledby="key-info"]',
    keyInfoLabels: {
      tenure: ['tenure'],
      councilTax: ['council tax band', 'council tax'],
      area: ['floor area', 'internal area'],
      lease: ['lease length', 'ground rent', 'service charge'],
    },
    // No stable hook on Zoopla's gallery, so the box attaches to the heading.
    photos: ['main h1', 'h1', 'main'],
  },
};

/**
 * Find the element a chip should sit under, or null. Never throws, whatever
 * the page looks like: a selector that matches nothing is the normal case here,
 * not an error.
 */
export function findAnchor(doc: Document, portal: Portal, anchor: FindingAnchor): Element | null {
  if (anchor === 'none') return null;
  const cfg = ANCHORS[portal];
  try {
    const sel = cfg.byTestId?.[anchor];
    if (sel) {
      const el = doc.querySelector(sel);
      if (el) return el;
    }
    const labels = cfg.keyInfoLabels?.[anchor];
    if (cfg.keyInfo && labels && labels.length > 0) {
      const section = doc.querySelector(cfg.keyInfo);
      if (section) {
        for (const li of Array.from(section.querySelectorAll('li'))) {
          const title = (li.textContent ?? '').trim().toLowerCase();
          if (labels.some((l) => title.startsWith(l))) return li;
        }
      }
    }
  } catch {
    // A malformed selector must never take the page down with it.
    return null;
  }
  return null;
}

/** Where the box under the photographs goes, trying each hook in turn. */
export function findBoxAnchor(doc: Document, portal: Portal): Element | null {
  for (const sel of ANCHORS[portal].photos ?? []) {
    try {
      const el = doc.querySelector(sel);
      if (el) return el;
    } catch { /* keep trying */ }
  }
  return doc.body ?? null;
}

/** Our own styling, entirely inside the shadow root. Nothing here escapes. */
const CSS = `
:host { all: initial; display: block; margin: 8px 0; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; }
.wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.mark { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase; color: #6b6b6b; }
.dot { width: 7px; height: 7px; border-radius: 2px; background: #dcff00; border: 1px solid #b9d600; }
.chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px;
  font-size: 12px; font-weight: 600; line-height: 1.5; cursor: pointer; border: 1px solid; background: #fff; }
.chip:focus-visible { outline: 2px solid #111; outline-offset: 2px; }
.chip.pink { color: #8a1141; border-color: #ff2d78; background: #ffe9f1; }
.chip.yellow { color: #6b4e00; border-color: #e0b400; background: #fff6d6; }
.ico { width: 11px; height: 11px; flex: 0 0 auto; }
.price { flex: 1 1 100%; margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.price-pos { font-size: 13px; font-weight: 700; color: #1a1a1a; }
.price-basis { font-size: 11px; color: #5c5c5c; font-variant-numeric: tabular-nums; }
.price-caveat { flex: 1 1 100%; margin: 2px 0 6px; font-size: 11px; line-height: 1.4; color: #5c5c5c; }
.why { flex: 1 1 100%; margin: 4px 0 0; font-size: 12px; line-height: 1.4; color: #333; }
.why[hidden] { display: none; }
.box { border: 1px solid #dcff00; border-left: 4px solid #dcff00; border-radius: 10px;
  padding: 8px 10px; background: #fcfcf4; }
.box .mark { margin-bottom: 6px; }
.hide { margin-left: auto; background: none; border: none; padding: 2px 4px; cursor: pointer;
  font-size: 11px; color: #6b6b6b; text-decoration: underline; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

const ICON_PATH: Record<'warning' | 'question', string> = {
  // A triangle — the shape people already read as "look at this".
  warning: 'M12 2 1 21h22L12 2Zm0 6 6.5 11h-13L12 8Zm-1 3v4h2v-4h-2Zm0 5v2h2v-2h-2Z',
  // A question mark — this is a thing to ask, not a thing that is wrong.
  question: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 15.5a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Zm1-3.2v.7h-2v-1.6c0-1.6 2.6-1.8 2.6-3.4A1.6 1.6 0 0 0 12 8.4c-1 0-1.7.6-1.9 1.5l-1.9-.5A3.7 3.7 0 0 1 12 6.5a3.6 3.6 0 0 1 3.7 3.5c0 2.3-2.7 2.7-2.7 4.3Z',
};

function icon(doc: Document, kind: 'risk' | 'gap'): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS(NS, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', ICON_PATH[FINDING_ICON[kind]]);
  svg.appendChild(path);
  return svg;
}

/**
 * One chip. The label is the whole message; the line of why is behind a tap,
 * because the page is not ours to fill with our explanations.
 */
function chipEl(doc: Document, f: Finding): HTMLElement {
  const words = FINDING_COPY[f.code];
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = `chip ${FINDING_TONE[f.kind]}`;
  btn.setAttribute('aria-expanded', 'false');
  btn.append(icon(doc, f.kind));
  const text = doc.createElement('span');
  text.textContent = words.label;
  btn.append(text);
  return btn;
}

export interface ChipGroupDeps {
  doc: Document;
  findings: readonly Finding[];
  brand: string;
  /** Rendered as the box (branded, with a Hide) rather than a bare chip row. */
  asBox: boolean;
  /**
   * X4 — the price position, shown in the box ABOVE the chips.
   *
   * It goes first because it is the only thing we put on their page that is not
   * a worry: the chips are what to check, this is the answer. Only ever passed
   * for the box, and only when there is a real position to state.
   */
  band?: BandOutcome | null;
  onHide?: () => void;
}

/** Money, in the panel's own format — the chips carry no formatter of their own. */
const gbp = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;

/**
 * The price line, or null. Null on every honest refusal: no floor area, too few
 * comparables, a spread too wide to have a middle. A missing line is a state
 * this box is designed for, not a failure.
 */
export function priceLine(band: BandOutcome | null | undefined): { position: string; basis: string } | null {
  if (!band || band.kind !== 'range') return null;
  const basis = `${gbp(band.low)}–${gbp(band.high)}/m² · ${PRICE_LINE.basis(band.count)}`
    + (band.widened ? ` · ${PRICE_LINE.widened}` : '');
  return { position: PRICE_LINE[band.position], basis };
}

/**
 * Build one group inside a CLOSED shadow root and hand back the host element.
 *
 * Closed on purpose: the portal's own scripts cannot reach in and read or
 * rewrite what we have put on their page, and ours cannot be styled by
 * theirs. `all: initial` on the host is the second half of that — without it,
 * an inherited `font-size: 0` or `text-transform` from their page still
 * applies to the host box itself.
 */
export function buildGroup({ doc, findings, brand, asBox, band, onHide }: ChipGroupDeps): HTMLElement | null {
  const content = buildGroupContent({ doc, findings, brand, asBox, band, onHide });
  if (content === null) return null;
  const host = doc.createElement(CHIP_HOST_TAG);
  host.setAttribute(CHIPS_ROOT_ATTR, asBox ? 'box' : 'anchored');
  // CLOSED on purpose: the portal's own scripts cannot reach in and read or
  // rewrite what we put on their page, and ours cannot be styled by theirs.
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = CSS;
  root.append(style, content);
  // The `hide` control removes the host, which only this function has.
  content.querySelector('.hide')?.addEventListener('click', () => host.remove());
  return host;
}

/**
 * The group's actual markup, separated from the shadow root it lives in.
 *
 * WHY THIS IS ITS OWN FUNCTION. The real root is closed, which is the point —
 * so nothing outside can read what we rendered, including a test. Rather than
 * open the root in production to make it testable, or assert on nothing and
 * call it covered, the CONTENT is built here and the root is attached above.
 * Tests get the real markup; the page still cannot reach it.
 */
export function buildGroupContent({ doc, findings, brand, asBox, band, onHide }: ChipGroupDeps): HTMLElement | null {
  const price = asBox ? priceLine(band) : null;
  // A box with a price line earns its place even with no chips in it.
  if (findings.length === 0 && price === null) return null;

  const wrap = doc.createElement('div');
  wrap.className = asBox ? 'wrap box' : 'wrap';
  wrap.setAttribute('role', 'complementary');
  wrap.setAttribute('aria-label', `${brand}: ${FINDINGS_COPY.boxTitle}`);

  // IT MUST BE OBVIOUSLY OURS — on every group, not only the box.
  const mark = doc.createElement('span');
  mark.className = 'mark';
  const dot = doc.createElement('span');
  dot.className = 'dot';
  mark.append(dot, doc.createTextNode(brand));
  wrap.append(mark);

  /**
   * THE PRICE, FIRST. Everything after it is a caveat; this is the answer, and
   * it is the one line on this page that nobody else can give them.
   */
  if (price !== null) {
    const row = doc.createElement('p');
    row.className = 'price';
    const pos = doc.createElement('strong');
    pos.className = 'price-pos';
    pos.textContent = price.position;
    const basis = doc.createElement('span');
    basis.className = 'price-basis';
    basis.textContent = price.basis;
    row.append(pos, basis);
    wrap.append(row);
    const cav = doc.createElement('p');
    cav.className = 'price-caveat';
    cav.textContent = PRICE_LINE.caveat;
    wrap.append(cav);
  }

  const why = doc.createElement('p');
  why.className = 'why';
  why.hidden = true;

  for (const f of findings) {
    const btn = chipEl(doc, f);
    btn.addEventListener('click', () => {
      const line = FINDING_COPY[f.code].why;
      const open = why.hidden || why.textContent !== line;
      why.textContent = line;
      why.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
    wrap.append(btn);
  }

  if (asBox && onHide) {
    const hide = doc.createElement('button');
    hide.type = 'button';
    hide.className = 'hide';
    hide.textContent = FINDINGS_COPY.dismiss;
    hide.setAttribute('aria-label', FINDINGS_COPY.dismissLabel);
    hide.addEventListener('click', () => onHide());
    wrap.append(hide);
  }

  wrap.append(why);
  return wrap;
}

/** Everything we have put on this page, so it can be taken off again. */
export function ourHosts(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll(`${CHIP_HOST_TAG}[${CHIPS_ROOT_ATTR}]`));
}

export function removeChips(doc: Document): void {
  for (const el of ourHosts(doc)) el.remove();
}

export interface MountDeps {
  doc: Document;
  portal: Portal;
  findings: readonly Finding[];
  brand: string;
  /** X4 — the price position, which goes in the box above the chips. */
  band?: BandOutcome | null;
  onHide?: () => void;
}

/**
 * Put the findings on the page: each one under the thing it refers to, and
 * everything that has nowhere to sit into one box.
 *
 * GUARDS AGAINST INJECTING TWICE. Both portals are single-page apps that
 * re-render constantly; every mount clears our own nodes first, so a re-render
 * that fires while we are working can never leave two of anything.
 */
export function mountChips({ doc, portal, findings, brand, band, onHide }: MountDeps): { anchored: number; inBox: number; price: boolean } {
  removeChips(doc);
  const hasPrice = priceLine(band) !== null;
  if (findings.length === 0 && !hasPrice) return { anchored: 0, inBox: 0, price: false };

  const boxed: Finding[] = [];
  let anchored = 0;

  // Group by anchor so two findings about the lease share one chip row.
  const byAnchor = new Map<FindingAnchor, Finding[]>();
  for (const f of findings) {
    const list = byAnchor.get(f.anchor) ?? [];
    list.push(f);
    byAnchor.set(f.anchor, list);
  }

  for (const [anchor, group] of byAnchor) {
    const target = findAnchor(doc, portal, anchor);
    if (target === null || target.parentNode === null) {
      // No home on this page — into the box, never guessed at a position.
      boxed.push(...group);
      continue;
    }
    const host = buildGroup({ doc, findings: group, brand, asBox: false });
    if (host === null) continue;
    target.insertAdjacentElement('afterend', host);
    anchored += group.length;
  }

  // The box is drawn whenever there is a price to state, even with no chips in
  // it: the price IS the reason the box is worth having.
  if (boxed.length > 0 || hasPrice) {
    const host = buildGroup({ doc, findings: boxed, brand, asBox: true, band, onHide });
    const target = findBoxAnchor(doc, portal);
    if (host !== null && target !== null) {
      if (target === doc.body) target.prepend(host);
      else target.insertAdjacentElement('afterend', host);
    }
  }
  return { anchored, inBox: boxed.length, price: hasPrice };
}

/**
 * TRACEPLAN — THE ONLY DOOR IN OR OUT OF THIS MODULE (T1).
 *
 * ── THE BOUNDARY ────────────────────────────────────────────────────────────
 * Nothing outside `src/traceplan/` may import anything from inside it except
 * what this file exports. A test enforces that, so the module can be replaced
 * wholesale — its UI, its maths, its storage, its words — without touching a
 * line anywhere else.
 *
 * ── WHAT MAY CROSS, AND WHY IT IS ONLY THIS ─────────────────────────────────
 * `TracedRoom` — a name and three numbers. That is the entire vocabulary this
 * feature speaks to the rest of the product.
 *
 * NOT the image. NOT its URL. NOT the traced vertices. NOT a canvas, a blob, a
 * data URI, an ImageBitmap or anything else from which a picture could be
 * reconstructed. The agent's floorplan is THEIR copyright: the extension may
 * put it on screen because the user's own browser already fetched it from the
 * portal, and that is the end of what we are entitled to do with it.
 *
 * ── HOW THE IMAGE IS KEPT IN THE BROWSER ────────────────────────────────────
 * It is only ever an `<image href="https://…portal CDN…">` in the SVG — the same
 * request the listing page itself made, served from the portal's own cache.
 *
 * This module therefore never HOLDS the bytes, which is stronger than promising
 * not to send them: there is nothing to send. Specifically it never calls
 * `canvas.drawImage`, `getImageData`, `toDataURL`, `toBlob`, `createImageBitmap`
 * or `fetch` on the plan. Tests assert each of those absences, and assert that
 * the emitted result contains none of the shapes image data could hide in.
 */
import { TRACEPLAN_COPY } from './config';
import { createChrome, createSurface } from './view';
import { reading, type TracerState } from './tracer';

/**
 * THE ONE TYPED INTERFACE. A room the user traced: what they called it, how big
 * it is, and how big it might really be. Strings and numbers, nothing else,
 * ever — widening this type is how the boundary would be lost, so a test pins
 * its shape.
 */
export interface TracedRoom {
  /** What the user called it, e.g. "Lounge". Trimmed, never empty. */
  readonly name: string;
  /** Area in m², to one decimal place. */
  readonly areaSqm: number;
  /** The honest range around it, same units and precision. */
  readonly areaLowSqm: number;
  readonly areaHighSqm: number;
}

export interface TraceplanOptions {
  /** Where to mount. The module owns everything inside it and nothing outside. */
  container: HTMLElement;
  /**
   * The floorplan as the LISTING PAGE already loaded it — a URL on the portal's
   * own CDN. A `blob:` or `data:` URL is refused: those are bytes we would be
   * holding, and holding them is the thing this module must not do.
   */
  imageUrl: string;
  /** Called when the user accepts a measurement. Numbers and a name only. */
  onRoom: (room: TracedRoom) => void;
  /** Called when the user closes the tracer. */
  onClose: () => void;
}

/** A URL we are willing to display: the portal's, over https, never our own bytes. */
export function isDisplayableImageUrl(url: string): boolean {
  if (typeof url !== 'string' || url.trim() === '') return false;
  const lowered = url.trim().toLowerCase();
  // blob: and data: mean the bytes are in our hands. filesystem: likewise.
  if (/^(blob:|data:|filesystem:)/.test(lowered)) return false;
  return /^https:\/\//.test(lowered);
}

/**
 * The result, built from state at the moment the user accepts it. Constructed
 * field by field on purpose: spreading state here is exactly how something that
 * should not leave would one day leave.
 */
export function roomFrom(state: TracerState, name: string): TracedRoom | null {
  const r = reading(state);
  const clean = name.trim().slice(0, 60);
  if (r === null || clean === '') return null;
  return { name: clean, areaSqm: r.sqm, areaLowSqm: r.lowSqm, areaHighSqm: r.highSqm };
}

/**
 * Mount the tracer. Returns a teardown that removes every node and listener it
 * made — the module leaves nothing behind, which is what makes it removable.
 */
export function mountTraceplan(opts: TraceplanOptions): () => void {
  const root = document.createElement('div');
  root.className = 'traceplan';

  if (!isDisplayableImageUrl(opts.imageUrl)) {
    const p = document.createElement('p');
    p.className = 'tp-caveat';
    p.textContent = TRACEPLAN_COPY.unavailable;
    root.append(p);
    opts.container.append(root);
    return () => root.remove();
  }

  const head = document.createElement('div');
  head.className = 'tp-head';
  const title = document.createElement('h2');
  title.className = 'tp-title';
  title.textContent = TRACEPLAN_COPY.title;
  const intro = document.createElement('p');
  intro.className = 'tp-intro';
  intro.textContent = TRACEPLAN_COPY.intro;
  const imageNote = document.createElement('p');
  imageNote.className = 'tp-caveat';
  imageNote.textContent = TRACEPLAN_COPY.imageNote;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'tp-btn tp-btn-quiet tp-close';
  closeBtn.textContent = TRACEPLAN_COPY.close;
  head.append(title, closeBtn);

  const surface = createSurface({ imageUrl: opts.imageUrl, onChange: (s) => chrome.sync(s) });
  const chrome = createChrome(surface);

  // Naming and accepting live here rather than in the chrome, because this is
  // the only place allowed to construct the thing that crosses the boundary.
  const accept = document.createElement('div');
  accept.className = 'tp-accept';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'tp-label';
  nameLabel.textContent = TRACEPLAN_COPY.result.nameLabel;
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'tp-input';
  nameInput.placeholder = TRACEPLAN_COPY.result.namePlaceholder;
  nameInput.id = 'tp-room-name';
  nameLabel.setAttribute('for', nameInput.id);
  const useBtn = document.createElement('button');
  useBtn.type = 'button';
  useBtn.className = 'tp-btn tp-btn-primary';
  useBtn.textContent = TRACEPLAN_COPY.result.save;
  accept.append(nameLabel, nameInput, useBtn);

  useBtn.addEventListener('click', () => {
    const room = roomFrom(surface.state(), nameInput.value);
    if (room !== null) opts.onRoom(room);
  });
  closeBtn.addEventListener('click', () => opts.onClose());

  root.append(head, intro, surface.element, chrome.element, accept, imageNote);
  opts.container.append(root);

  const syncAccept = (s: TracerState): void => { accept.hidden = reading(s) === null; };
  syncAccept(surface.state());
  const originalSync = chrome.sync;
  (chrome as { sync: (s: TracerState) => void }).sync = (s: TracerState) => { originalSync(s); syncAccept(s); };

  return () => { surface.destroy(); root.remove(); };
}

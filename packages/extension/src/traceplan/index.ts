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
import { levelSqm, propertySqm, roomReading, tracedRooms, type TracerState } from './tracer';

/**
 * THE ONE TYPED INTERFACE. A room the user traced: what they called it, how big
 * it is, and how big it might really be. Strings and numbers, nothing else,
 * ever — widening this type is how the boundary would be lost, so a test pins
 * its shape.
 */
export interface TracedRoom {
  /** What the user called it, e.g. "Lounge". Trimmed, never empty. */
  readonly name: string;
  /** Which storey it is on, e.g. "Ground floor". */
  readonly level: string;
  /** Area in m², to one decimal place. */
  readonly areaSqm: number;
  /** The honest range around it, same units and precision. */
  readonly areaLowSqm: number;
  readonly areaHighSqm: number;
}

/**
 * T2 — the whole traced plan. Still nothing but strings and numbers: one image
 * of a floorplan goes in, a list of names and areas comes out, and no picture
 * can be reconstructed from any of it.
 */
export interface TracedPlan {
  readonly rooms: readonly TracedRoom[];
  readonly levels: readonly { readonly name: string; readonly areaSqm: number }[];
  /** Every level added together — the figure the EPC was solved against. */
  readonly totalSqm: number;
  /** How it was sized, so the caller can say so too. */
  readonly sizedBy: 'dimension' | 'epc' | 'room' | 'none';
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
  /**
   * T2 — a total floor area we ALREADY hold, offered as a calibration. Numbers
   * coming IN are fine; it is what goes out that is constrained.
   */
  known?: { sqm: number; source: string } | null;
  /** Called when the user accepts the plan. Names and numbers only. */
  onPlan: (plan: TracedPlan) => void;
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
export function planFrom(state: TracerState): TracedPlan | null {
  const total = propertySqm(state);
  if (total === null || tracedRooms(state).length === 0) return null;
  const rooms: TracedRoom[] = [];
  for (const level of state.levels) {
    for (const room of level.rooms) {
      const r = roomReading(state, room);
      if (r === null) continue;
      // Built field by field on purpose: spreading state here is exactly how
      // something that should not leave would one day leave.
      rooms.push({
        name: room.name, level: level.name,
        areaSqm: r.sqm, areaLowSqm: r.lowSqm, areaHighSqm: r.highSqm,
      });
    }
  }
  const levels = state.levels
    .map((lv, i) => ({ name: lv.name, areaSqm: levelSqm(state, i) ?? 0 }))
    .filter((lv) => lv.areaSqm > 0);
  return { rooms, levels, totalSqm: total, sizedBy: state.calibration.kind };
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

  const surface = createSurface({
    imageUrl: opts.imageUrl,
    known: opts.known ?? null,
    onChange: (st) => { chrome.sync(st); syncAccept(st); },
  });
  const chrome = createChrome(surface);

  // Accepting lives here rather than in the chrome, because this is the only
  // place allowed to construct the thing that crosses the boundary.
  const accept = document.createElement('div');
  accept.className = 'tp-accept';
  const useBtn = document.createElement('button');
  useBtn.type = 'button';
  useBtn.className = 'tp-btn tp-btn-primary';
  useBtn.textContent = TRACEPLAN_COPY.result.save;
  accept.append(useBtn);
  useBtn.addEventListener('click', () => {
    const plan = planFrom(surface.state());
    if (plan !== null) opts.onPlan(plan);
  });
  closeBtn.addEventListener('click', () => opts.onClose());

  const syncAccept = (st: TracerState): void => { accept.hidden = planFrom(st) === null; };

  root.append(head, intro, surface.element, chrome.element, accept, imageNote);
  opts.container.append(root);
  syncAccept(surface.state());

  return () => { surface.destroy(); root.remove(); };
}

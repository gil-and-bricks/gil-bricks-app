/**
 * TRACEPLAN — THE SURFACE. Hand-rolled SVG, no drawing library.
 *
 * WHY SVG AND NOT CANVAS. The shapes stay in the DOM, so they can carry
 * accessibility semantics and be inspected; they are resolution-independent, so
 * a pinch-zoomed wall stays a crisp hairline instead of a stack of blocks; and
 * the surface has a fixed box from its first paint, so nothing below it moves.
 *
 * WHY POINTER EVENTS, AND `touch-action: none`. One code path for finger, pen
 * and mouse. Without `touch-action: none` the browser claims the gesture for
 * its own scroll and zoom before we see the second move, and the trace fights
 * the page. `pointercancel` is handled because the system CAN still take a
 * gesture away — a notification, a palm, an incoming call — and a half-placed
 * corner must not be left stuck to the finger.
 *
 * THE GESTURE GRAMMAR, chosen so nothing needs a mode switch:
 *   ONE finger  — precision work: place a corner, or drag one.
 *   TWO fingers — navigation: pinch to zoom, drag to pan.
 * A person never has to say which they mean; their hand already did.
 *
 * THE IMAGE IS A URL THE BROWSER ALREADY HAS. It is rendered with <image href>,
 * pointing at the portal's own CDN, exactly as the listing page does. This
 * module never reads its pixels, never draws it to a canvas, and never obtains
 * bytes it could send anywhere. See index.ts for the boundary that keeps it so.
 */
import { TRACEPLAN_COPY as C, TRACEPLAN_TOLERANCES as T } from './config';
import { loupePosition, toScreen, type Pt } from './geometry';
import {
  closeRoom, grab, initialState, lastWallMetres, moveHeld, pan, reading, redoScale,
  release, restart, screenPoints, setScale, tapScale, tapTrace, undo, zoomAbout,
  type TracerState,
} from './tracer';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] =>
  document.createElementNS(NS, tag);
const attr = (el: Element, a: Record<string, string | number>): void => {
  for (const [k, v] of Object.entries(a)) el.setAttribute(k, String(v));
};
const el = (tag: string, cls: string, text?: string): HTMLElement => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const one = (n: number): string => n.toFixed(1);

export interface SurfaceOptions {
  /** The floorplan's URL, as the listing page already loaded it. */
  imageUrl: string;
  /** Called whenever state changes, so the host can redraw its own chrome. */
  onChange: (state: TracerState) => void;
}

/**
 * Builds the surface and wires every gesture. Returns the element plus a
 * teardown, because a panel that re-renders must be able to let this go.
 */
export function createSurface(opts: SurfaceOptions): {
  element: HTMLElement;
  destroy: () => void;
  state: () => TracerState;
  apply: (fn: (s: TracerState) => TracerState) => void;
} {
  let state = initialState();
  const host = el('div', 'tp-surface');
  const svg = svgEl('svg');
  attr(svg, { class: 'tp-svg', role: 'application', 'aria-label': C.title, tabindex: 0 });
  host.append(svg);

  // --- layers, back to front -------------------------------------------------
  const imageLayer = svgEl('g');
  const plan = svgEl('image');
  attr(plan, { href: opts.imageUrl, x: 0, y: 0, class: 'tp-plan', preserveAspectRatio: 'xMidYMid meet' });
  imageLayer.append(plan);

  const shapes = svgEl('g');
  const loupe = svgEl('g');
  attr(loupe, { class: 'tp-loupe', 'aria-hidden': 'true' });
  svg.append(imageLayer, shapes, loupe);

  // The loupe's own magnified copy of the plan, clipped to a circle.
  const clipId = `tp-clip-${Math.random().toString(36).slice(2, 8)}`;
  const defs = svgEl('defs');
  const clip = svgEl('clipPath');
  attr(clip, { id: clipId });
  const clipCircle = svgEl('circle');
  clip.append(clipCircle);
  defs.append(clip);
  svg.append(defs);

  const loupeImg = svgEl('image');
  attr(loupeImg, { href: opts.imageUrl, 'clip-path': `url(#${clipId})`, preserveAspectRatio: 'xMidYMid meet' });
  const loupeRing = svgEl('circle');
  attr(loupeRing, { class: 'tp-loupe-ring' });
  const crossH = svgEl('line');
  const crossV = svgEl('line');
  attr(crossH, { class: 'tp-cross' });
  attr(crossV, { class: 'tp-cross' });
  loupe.append(loupeImg, loupeRing, crossH, crossV);

  let touchPoint: Pt | null = null;
  const pointers = new Map<number, Pt>();
  let pinchStart: { dist: number; centre: Pt } | null = null;
  let panLast: Pt | null = null;
  /**
   * True from the moment a SECOND finger lands until the LAST one leaves.
   * Without it, lifting the first finger of a pinch cleared the pinch state and
   * the second finger's lift was then read as a tap — so every zoom ended by
   * dropping a stray corner on the plan. Found by driving the real surface.
   */
  let multiTouch = false;

  const size = (): { width: number; height: number } => {
    const r = svg.getBoundingClientRect();
    return { width: r.width || 320, height: r.height || 360 };
  };
  const local = (e: PointerEvent): Pt => {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function drawLoupe(): void {
    if (touchPoint === null) { loupe.setAttribute('display', 'none'); return; }
    loupe.removeAttribute('display');
    const s = size();
    const pos = loupePosition(touchPoint, s, T.loupeSizePx, T.loupeOffsetPx);
    const half = T.loupeSizePx / 2;
    attr(clipCircle, { cx: pos.x, cy: pos.y, r: half });
    attr(loupeRing, { cx: pos.x, cy: pos.y, r: half });
    // Place the magnified image so the touched pixel sits at the loupe centre.
    const z = state.view.scale * T.loupeZoom;
    attr(loupeImg, {
      x: pos.x - (touchPoint.x - state.view.tx) * T.loupeZoom,
      y: pos.y - (touchPoint.y - state.view.ty) * T.loupeZoom,
      width: (plan.getBBox().width || s.width) * z,
      height: (plan.getBBox().height || s.height) * z,
    });
    attr(crossH, { x1: pos.x - 12, y1: pos.y, x2: pos.x + 12, y2: pos.y });
    attr(crossV, { x1: pos.x, y1: pos.y - 12, x2: pos.x, y2: pos.y + 12 });
  }

  function draw(): void {
    const s = size();
    attr(svg, { viewBox: `0 0 ${s.width} ${s.height}` });
    attr(imageLayer, { transform: `translate(${state.view.tx} ${state.view.ty}) scale(${state.view.scale})` });
    attr(plan, { width: s.width, height: s.height });

    while (shapes.firstChild) shapes.removeChild(shapes.firstChild);
    const pts = screenPoints(state);

    if (pts.length > 1) {
      const poly = svgEl(state.closed ? 'polygon' : 'polyline');
      attr(poly, { class: state.closed ? 'tp-room' : 'tp-walls', points: pts.map((p) => `${p.x},${p.y}`).join(' ') });
      shapes.append(poly);
    }
    // The live wall length, beside the wall being drawn.
    const wall = lastWallMetres(state);
    if (wall !== null && !state.closed && pts.length >= 2) {
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      const label = svgEl('text');
      attr(label, { class: 'tp-wall-len', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 6, 'text-anchor': 'middle' });
      label.textContent = C.trace.wall(one(wall));
      shapes.append(label);
    }
    pts.forEach((p, i) => {
      const dot = svgEl('circle');
      const isFirst = i === 0 && !state.closed && state.points.length >= T.minPoints;
      attr(dot, { class: `tp-dot${isFirst ? ' tp-dot-close' : ''}${state.dragging === i ? ' tp-dot-held' : ''}`, cx: p.x, cy: p.y, r: isFirst ? 10 : 7 });
      shapes.append(dot);
    });
    // The scale reference, while it is being set.
    state.scalePoints.forEach((p, i) => {
      const sp = toScreen(p, state.view);
      const dot = svgEl('circle');
      attr(dot, { class: 'tp-scale-dot', cx: sp.x, cy: sp.y, r: 7 });
      shapes.append(dot);
      if (i === 1) {
        const a = toScreen(state.scalePoints[0], state.view);
        const line = svgEl('line');
        attr(line, { class: 'tp-scale-line', x1: a.x, y1: a.y, x2: sp.x, y2: sp.y });
        shapes.append(line);
      }
    });
    drawLoupe();
  }

  const set = (fn: (s: TracerState) => TracerState): void => {
    state = fn(state);
    draw();
    opts.onChange(state);
  };

  // --- gestures --------------------------------------------------------------
  const onDown = (e: PointerEvent): void => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) {
      // Two fingers: stop any single-finger work and start navigating.
      multiTouch = true;
      touchPoint = null;
      const [a, b] = [...pointers.values()];
      pinchStart = { dist: Math.hypot(b.x - a.x, b.y - a.y), centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      panLast = pinchStart.centre;
      set(release);
      return;
    }
    if (pointers.size > 2) return;
    touchPoint = local(e);
    // Picking up an existing corner happens on DOWN, so the drag is continuous.
    if (state.phase !== 'scale') set((s) => grab(s, touchPoint as Pt));
    else draw();
  };

  const onMove = (e: PointerEvent): void => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    if (pointers.size >= 2 && pinchStart !== null) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (dist > 0 && pinchStart.dist > 0) set((s) => zoomAbout(s, centre, dist / pinchStart!.dist));
      if (panLast !== null) set((s) => pan(s, centre.x - panLast!.x, centre.y - panLast!.y));
      pinchStart = { dist, centre };
      panLast = centre;
      return;
    }
    touchPoint = local(e);
    if (state.dragging !== null) set((s) => moveHeld(s, touchPoint as Pt));
    else draw();
  };

  /**
   * COMMIT ON LIFT, AT THE CROSSHAIR. The point is placed where the magnifier
   * was showing it, not under the pad of the finger — which is the whole reason
   * the loupe exists. It also means a misplaced finger can be slid to the right
   * spot before lifting, instead of undone afterwards.
   */
  const onUp = (e: PointerEvent): void => {
    const at = pointers.get(e.pointerId) ?? touchPoint;
    pointers.delete(e.pointerId);
    if (pointers.size >= 1) { pinchStart = null; panLast = null; touchPoint = null; draw(); return; }
    // The LAST finger has left, so the gesture is over and can be judged.
    const wasNavigating = multiTouch;
    multiTouch = false;
    pinchStart = null;
    panLast = null;
    touchPoint = null;
    if (wasNavigating || at === null) { set(release); return; }
    if (state.dragging !== null) { set(release); return; }
    set((s) => (s.phase === 'scale' ? tapScale(s, at) : tapTrace(s, at)));
  };

  /**
   * The system took the gesture away. Drop everything in progress rather than
   * leaving a corner stuck to a finger that is no longer there.
   */
  const onCancel = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) multiTouch = false;
    pinchStart = null;
    panLast = null;
    touchPoint = null;
    set(release);
  };

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onCancel);
  svg.addEventListener('lostpointercapture', onCancel);

  draw();
  return {
    element: host,
    destroy: () => {
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onCancel);
      svg.removeEventListener('lostpointercapture', onCancel);
      host.remove();
    },
    state: () => state,
    apply: set,
  };
}

/** The controls and readouts around the surface. Every string from config. */
export function createChrome(surface: ReturnType<typeof createSurface>): {
  element: HTMLElement; sync: (s: TracerState) => void;
} {
  const box = el('div', 'tp-chrome');
  const status = el('p', 'tp-status');
  status.setAttribute('role', 'status');
  const err = el('p', 'tp-error');
  err.setAttribute('role', 'alert');

  const scaleRow = el('div', 'tp-scale-row');
  const lenLabel = el('label', 'tp-label', C.scale.lengthLabel);
  const lenInput = document.createElement('input');
  lenInput.type = 'text';
  lenInput.inputMode = 'decimal';
  lenInput.className = 'tp-input';
  lenInput.placeholder = C.scale.lengthPlaceholder;
  lenInput.id = 'tp-length';
  lenLabel.setAttribute('for', lenInput.id);
  const setBtn = el('button', 'tp-btn tp-btn-primary', C.scale.set) as HTMLButtonElement;
  setBtn.type = 'button';
  scaleRow.append(lenLabel, lenInput, setBtn);

  const traceRow = el('div', 'tp-trace-row');
  const undoBtn = el('button', 'tp-btn', C.trace.undo) as HTMLButtonElement;
  const closeBtn = el('button', 'tp-btn', C.trace.close) as HTMLButtonElement;
  const againBtn = el('button', 'tp-btn', C.trace.restart) as HTMLButtonElement;
  const redoScaleBtn = el('button', 'tp-btn tp-btn-quiet', C.scale.redo) as HTMLButtonElement;
  for (const b of [undoBtn, closeBtn, againBtn, redoScaleBtn]) b.type = 'button';
  traceRow.append(undoBtn, closeBtn, againBtn, redoScaleBtn);

  const result = el('div', 'tp-result');
  const areaLine = el('p', 'tp-area');
  const rangeLine = el('p', 'tp-range');
  const caveat = el('p', 'tp-caveat', C.result.caveat);
  const notSaved = el('p', 'tp-caveat', C.nothingSaved);
  result.append(areaLine, rangeLine, caveat, notSaved);

  box.append(status, err, scaleRow, traceRow, result);

  setBtn.addEventListener('click', () => {
    const metres = Number(lenInput.value.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(metres) || metres <= 0) { err.textContent = C.scale.needLength; return; }
    surface.apply((s) => setScale(s, metres, C.scale.tooShort));
  });
  undoBtn.addEventListener('click', () => surface.apply(undo));
  closeBtn.addEventListener('click', () => surface.apply(closeRoom));
  againBtn.addEventListener('click', () => surface.apply(restart));
  redoScaleBtn.addEventListener('click', () => surface.apply(redoScale));

  const sync = (s: TracerState): void => {
    err.textContent = s.error ?? '';
    scaleRow.hidden = s.phase !== 'scale';
    traceRow.hidden = s.phase === 'scale';
    const r = reading(s);
    result.hidden = r === null;
    if (r !== null) {
      areaLine.textContent = C.result.area(one(r.sqm));
      rangeLine.textContent = C.result.range(one(r.lowSqm), one(r.highSqm));
    }
    closeBtn.disabled = s.points.length < T.minPoints || s.closed;
    undoBtn.disabled = s.points.length === 0 && !s.closed;
    status.textContent = s.phase === 'scale'
      ? (s.scalePoints.length === 0 ? C.scale.tapFirst : s.scalePoints.length === 1 ? C.scale.tapSecond : C.scale.lengthLabel)
      : s.closed
        ? C.result.heading
        : (s.points.length === 0 ? C.trace.first : C.trace.next);
  };
  sync(surface.state());
  return { element: box, sync };
}

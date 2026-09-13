/**
 * TRACEPLAN — THE SURFACE AND ITS CONTROLS. Hand-rolled SVG, no library.
 *
 * WHY SVG: stays in the DOM for accessibility semantics, stays crisp under
 * pinch-zoom, and holds a fixed box from first paint so nothing below shifts.
 *
 * WHY POINTER EVENTS + `touch-action: none`: one path for finger, pen and
 * mouse, and without the CSS the browser claims the gesture for its own scroll
 * before the second move arrives. `pointercancel` is handled because the system
 * can still take a gesture away and a corner must not stay stuck to a finger.
 *
 * GESTURE GRAMMAR — one finger is precision work, two fingers navigate. Nobody
 * has to choose a mode; their hand already did.
 *
 * THE IMAGE IS A URL THE BROWSER ALREADY HAS: `<image href>` at the portal's own
 * CDN, exactly as the listing page loaded it. Never read, never copied.
 */
import { AREA_SOURCE_LABELS, TRACEPLAN_COPY as C, TRACEPLAN_TOLERANCES as T } from './config';
import { loupePosition, needsMoreZoom, toScreen, type Pt } from './geometry';
import {
  activeLevel, addLevel, backToTrace, beginScale, clearDraft, commitRoom, draftScreen, grab,
  initialState, lastWallMetres, levelSqm, moveHeld, pan, propertySqm, release, renameLevel,
  renameRoom, roomReading, roomScreens, selectLevel, tapScale, tapTrace, tracedRooms, undo,
  useDimension, useKnownRoom, useKnownTotal, useNothing, zoomAbout, type TracerState,
} from './tracer';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(t: K): SVGElementTagNameMap[K] => document.createElementNS(NS, t);
const attr = (el: Element, a: Record<string, string | number>): void => {
  for (const [k, v] of Object.entries(a)) el.setAttribute(k, String(v));
};
const el = (tag: string, cls: string, text?: string): HTMLElement => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const btn = (cls: string, text: string): HTMLButtonElement => {
  const b = el('button', cls, text) as HTMLButtonElement;
  b.type = 'button';
  return b;
};
const one = (n: number): string => n.toFixed(1);

export interface SurfaceOptions {
  imageUrl: string;
  known: { sqm: number; source: string } | null;
  onChange: (state: TracerState) => void;
}

export function createSurface(opts: SurfaceOptions): {
  element: HTMLElement; destroy: () => void;
  state: () => TracerState; apply: (fn: (s: TracerState) => TracerState) => void;
} {
  let state = initialState(opts.known);
  const host = el('div', 'tp-surface');
  const svg = svgEl('svg');
  attr(svg, { class: 'tp-svg', role: 'application', 'aria-label': C.title, tabindex: 0 });
  host.append(svg);

  const imageLayer = svgEl('g');
  const plan = svgEl('image');
  attr(plan, { href: opts.imageUrl, x: 0, y: 0, class: 'tp-plan', preserveAspectRatio: 'xMidYMid meet' });
  imageLayer.append(plan);
  const shapes = svgEl('g');
  const loupe = svgEl('g');
  attr(loupe, { class: 'tp-loupe', 'aria-hidden': 'true' });
  svg.append(imageLayer, shapes, loupe);

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
  /** True from the second finger landing until the last leaves — see onUp. */
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
    const z = state.view.scale * T.loupeZoom;
    attr(loupeImg, {
      x: pos.x - (touchPoint.x - state.view.tx) * T.loupeZoom,
      y: pos.y - (touchPoint.y - state.view.ty) * T.loupeZoom,
      width: s.width * z, height: s.height * z,
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

    // Finished rooms on THIS level only — another storey's rooms are not part
    // of this one and drawing them together is the merge this sprint prevents.
    for (const { room, pts } of roomScreens(state)) {
      const poly = svgEl('polygon');
      attr(poly, { class: 'tp-room', points: pts.map((p) => `${p.x},${p.y}`).join(' ') });
      shapes.append(poly);
      const label = svgEl('text');
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
      attr(label, { class: 'tp-room-name', x: cx, y: cy, 'text-anchor': 'middle' });
      const r = roomReading(state, room);
      label.textContent = r === null ? room.name : `${room.name} · ${one(r.sqm)} m²`;
      shapes.append(label);
      for (const p of pts) {
        const dot = svgEl('circle');
        attr(dot, { class: 'tp-dot tp-dot-done', cx: p.x, cy: p.y, r: 5 });
        shapes.append(dot);
      }
    }

    const draft = draftScreen(state);
    if (draft.length > 1) {
      const line = svgEl('polyline');
      attr(line, { class: 'tp-walls', points: draft.map((p) => `${p.x},${p.y}`).join(' ') });
      shapes.append(line);
    }
    const wall = lastWallMetres(state);
    if (wall !== null && draft.length >= 2) {
      const a = draft[draft.length - 2];
      const b = draft[draft.length - 1];
      const label = svgEl('text');
      attr(label, { class: 'tp-wall-len', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 6, 'text-anchor': 'middle' });
      label.textContent = C.trace.wall(one(wall));
      shapes.append(label);
    }
    draft.forEach((p, i) => {
      const dot = svgEl('circle');
      const isClose = i === 0 && state.draft.length >= T.minPoints;
      const held = state.dragging?.room === null && state.dragging.index === i;
      attr(dot, { class: `tp-dot${isClose ? ' tp-dot-close' : ''}${held ? ' tp-dot-held' : ''}`, cx: p.x, cy: p.y, r: isClose ? 10 : 7 });
      shapes.append(dot);
    });
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

  const onDown = (e: PointerEvent): void => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) {
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
    if (state.phase === 'trace') set((s) => grab(s, touchPoint as Pt));
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

  /** Commit on LIFT, at the crosshair — never under the pad of the finger. */
  const onUp = (e: PointerEvent): void => {
    const at = pointers.get(e.pointerId) ?? touchPoint;
    pointers.delete(e.pointerId);
    if (pointers.size >= 1) { pinchStart = null; panLast = null; touchPoint = null; draw(); return; }
    const wasNavigating = multiTouch;
    multiTouch = false;
    pinchStart = null;
    panLast = null;
    touchPoint = null;
    if (wasNavigating || at === null) { set(release); return; }
    if (state.dragging !== null) { set(release); return; }
    set((s) => (s.phase === 'scale' ? tapScale(s, at) : tapTrace(s, at)));
  };

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
      for (const [t, fn] of [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp],
        ['pointercancel', onCancel], ['lostpointercapture', onCancel]] as const) {
        svg.removeEventListener(t, fn as EventListener);
      }
      host.remove();
    },
    state: () => state,
    apply: set,
  };
}

/** The controls and readouts. Every string from config. */
export function createChrome(surface: ReturnType<typeof createSurface>): {
  element: HTMLElement; sync: (s: TracerState) => void;
} {
  const box = el('div', 'tp-chrome');

  // T2 — the zoom nudge: said once, early, then gone for good.
  const zoomNote = el('div', 'tp-zoom-note');
  const zoomText = el('p', 'tp-zoom-text', C.zoom.prompt);
  const zoomOk = btn('tp-btn tp-btn-quiet', C.zoom.dismiss);
  zoomOk.addEventListener('click', () => surface.apply((s) => ({ ...s, zoomPrompted: true })));
  zoomNote.append(zoomText, zoomOk);

  // T2 — the level bar. Nothing is detected from the image; the user says.
  const levelBar = el('div', 'tp-levels');
  const levelWhy = el('p', 'tp-caveat', C.level.why);

  const status = el('p', 'tp-status');
  status.setAttribute('role', 'status');
  const err = el('p', 'tp-error');
  err.setAttribute('role', 'alert');

  const traceRow = el('div', 'tp-trace-row');
  const undoBtn = btn('tp-btn', C.trace.undo);
  const closeBtn = btn('tp-btn', C.trace.close);
  const clearBtn = btn('tp-btn', C.trace.restart);
  const sizeBtn = btn('tp-btn tp-btn-primary', C.scale.set);
  traceRow.append(undoBtn, closeBtn, clearBtn, sizeBtn);

  const roomList = el('div', 'tp-room-list');
  const totals = el('div', 'tp-totals');

  // --- the calibration panel, shown after tracing ---------------------------
  const scalePanel = el('div', 'tp-scale-panel');
  const scaleHead = el('h3', 'tp-subhead', C.scale.heading);
  const scalePrompt = el('p', 'tp-caveat', C.scale.prompt);
  const optDim = btn('tp-btn', C.scale.optionDimension);
  const optEpc = btn('tp-btn', '');
  const optRoom = btn('tp-btn', C.scale.optionRoom);
  const optNone = btn('tp-btn tp-btn-quiet', C.scale.optionNone);
  const optionRow = el('div', 'tp-options');
  optionRow.append(optDim, optEpc, optRoom, optNone);

  const dimBox = el('div', 'tp-dim-box');
  const dimHint = el('p', 'tp-caveat', C.scale.longest);
  const lenLabel = el('label', 'tp-label', C.scale.lengthLabel);
  const lenInput = document.createElement('input');
  lenInput.type = 'text';
  lenInput.inputMode = 'decimal';
  lenInput.className = 'tp-input';
  lenInput.placeholder = C.scale.lengthPlaceholder;
  lenInput.id = 'tp-length';
  lenLabel.setAttribute('for', lenInput.id);
  const dimGo = btn('tp-btn tp-btn-primary', C.scale.set);
  dimBox.append(dimHint, lenLabel, lenInput, dimGo);

  const roomBox = el('div', 'tp-room-box');
  const roomPickLabel = el('label', 'tp-label', C.scale.roomPick);
  const roomPick = document.createElement('select');
  roomPick.className = 'tp-input';
  roomPick.id = 'tp-room-pick';
  roomPickLabel.setAttribute('for', roomPick.id);
  const roomAreaLabel = el('label', 'tp-label', C.scale.roomArea);
  const roomArea = document.createElement('input');
  roomArea.type = 'text';
  roomArea.inputMode = 'decimal';
  roomArea.className = 'tp-input';
  roomArea.placeholder = C.scale.roomAreaPlaceholder;
  roomArea.id = 'tp-room-area';
  roomAreaLabel.setAttribute('for', roomArea.id);
  const roomGo = btn('tp-btn tp-btn-primary', C.scale.set);
  roomBox.append(roomPickLabel, roomPick, roomAreaLabel, roomArea, roomGo);

  const sizedBy = el('p', 'tp-sized-by');
  const sizedCaveat = el('p', 'tp-caveat');
  const backBtn = btn('tp-btn tp-btn-quiet', C.scale.redo);
  scalePanel.append(scaleHead, scalePrompt, optionRow, dimBox, roomBox, sizedBy, sizedCaveat, backBtn);

  box.append(zoomNote, levelWhy, levelBar, status, err, traceRow, roomList, totals, scalePanel);

  // --- wiring ----------------------------------------------------------------
  undoBtn.addEventListener('click', () => surface.apply(undo));
  closeBtn.addEventListener('click', () => surface.apply(commitRoom));
  clearBtn.addEventListener('click', () => surface.apply(clearDraft));
  sizeBtn.addEventListener('click', () => surface.apply((s) => (tracedRooms(s).length === 0
    ? { ...s, error: C.scale.needTrace } : beginScale(s))));
  backBtn.addEventListener('click', () => surface.apply(backToTrace));

  let chosen: 'dimension' | 'room' | null = null;
  optDim.addEventListener('click', () => { chosen = 'dimension'; surface.apply((s) => ({ ...s, scalePoints: [], error: null })); });
  optRoom.addEventListener('click', () => { chosen = 'room'; surface.apply((s) => ({ ...s, error: null })); });
  optEpc.addEventListener('click', () => { chosen = null; surface.apply((s) => useKnownTotal(s, C.scale.needTrace)); });
  optNone.addEventListener('click', () => { chosen = null; surface.apply(useNothing); });
  dimGo.addEventListener('click', () => {
    const m = Number(lenInput.value.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(m) || m <= 0) { err.textContent = C.scale.needLength; return; }
    surface.apply((s) => useDimension(s, m, C.scale.tooShort));
  });
  roomGo.addEventListener('click', () => {
    const a = Number(roomArea.value.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(a) || a <= 0) { err.textContent = C.scale.needRoom; return; }
    surface.apply((s) => useKnownRoom(s, roomPick.value, a, C.scale.needRoom));
  });

  const sync = (s: TracerState): void => {
    err.textContent = s.error ?? '';
    zoomNote.hidden = s.zoomPrompted || !needsMoreZoom(s.view.scale, T.traceZoomPrompt) || s.phase !== 'trace';

    // levels
    while (levelBar.firstChild) levelBar.removeChild(levelBar.firstChild);
    s.levels.forEach((lv, i) => {
      const b = btn(`tp-level${i === s.activeLevel ? ' is-on' : ''}`, lv.name);
      b.setAttribute('aria-pressed', String(i === s.activeLevel));
      b.addEventListener('click', () => surface.apply((st) => selectLevel(st, i)));
      levelBar.append(b);
    });
    const addBtn = btn('tp-level tp-level-add', C.level.add);
    addBtn.addEventListener('click', () => surface.apply(addLevel));
    levelBar.append(addBtn);
    const ren = btn('tp-btn tp-btn-quiet', C.level.rename);
    ren.addEventListener('click', () => {
      const name = window.prompt(C.level.renameLabel, activeLevel(s).name);
      if (name !== null) surface.apply((st) => renameLevel(st, st.activeLevel, name));
    });
    levelBar.append(ren);
    levelWhy.hidden = s.phase !== 'trace';
    levelBar.hidden = s.phase !== 'trace';

    traceRow.hidden = s.phase !== 'trace';
    scalePanel.hidden = s.phase !== 'scale';
    closeBtn.disabled = s.draft.length < T.minPoints;
    undoBtn.disabled = s.draft.length === 0 && activeLevel(s).rooms.length === 0;
    sizeBtn.disabled = tracedRooms(s).length === 0;

    // the rooms on this level, renameable
    while (roomList.firstChild) roomList.removeChild(roomList.firstChild);
    for (const room of activeLevel(s).rooms) {
      const row = el('div', 'tp-room-row');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'tp-input tp-room-name-input';
      input.value = room.name;
      input.setAttribute('aria-label', C.result.nameLabel);
      input.addEventListener('change', () => surface.apply((st) => renameRoom(st, room.id, input.value)));
      const r = roomReading(s, room);
      row.append(input, el('span', 'tp-room-area', r === null ? '' : C.result.area(one(r.sqm))));
      roomList.append(row);
    }
    roomList.hidden = activeLevel(s).rooms.length === 0;

    // totals: each level, then the property
    while (totals.firstChild) totals.removeChild(totals.firstChild);
    const total = propertySqm(s);
    if (total !== null) {
      s.levels.forEach((lv, i) => {
        const v = levelSqm(s, i);
        if (v !== null && lv.rooms.length > 0) totals.append(el('p', 'tp-level-total', C.result.levelTotal(lv.name, one(v))));
      });
      totals.append(el('p', 'tp-area', C.result.propertyTotal(one(total))));
      const anyRange = tracedRooms(s).length > 0;
      if (anyRange) {
        totals.append(el('p', 'tp-range', C.result.range(one(total * 0.9), one(total * 1.1))));
      }
      totals.append(el('p', 'tp-caveat', C.result.caveat));
      if (s.levels.filter((l) => l.rooms.length > 0).length > 1) {
        totals.append(el('p', 'tp-caveat', C.level.totalNote));
      }
    } else if (tracedRooms(s).length > 0 && s.phase === 'scale') {
      totals.append(el('p', 'tp-caveat', C.scale.unmeasured));
    }
    totals.hidden = totals.childElementCount === 0;

    // calibration panel
    optEpc.hidden = s.known === null;
    if (s.known !== null) {
      optEpc.textContent = C.scale.optionEpc(one(s.known.sqm), AREA_SOURCE_LABELS[s.known.source] ?? s.known.source);
    }
    dimBox.hidden = chosen !== 'dimension';
    roomBox.hidden = chosen !== 'room';
    if (chosen === 'room') {
      const rooms = tracedRooms(s);
      if (roomPick.options.length !== rooms.length) {
        roomPick.textContent = '';
        for (const r of rooms) {
          const o = document.createElement('option');
          o.value = r.id;
          o.textContent = r.name;
          roomPick.append(o);
        }
      }
    }
    const cal = s.calibration;
    sizedBy.textContent = cal.kind === 'dimension' ? C.scale.usingDimension(one(cal.dimensionMetres ?? 0))
      : cal.kind === 'epc' ? C.scale.usingEpc(one(cal.knownSqm ?? 0), AREA_SOURCE_LABELS[cal.knownSource ?? ''] ?? (cal.knownSource ?? ''))
        : cal.kind === 'room' ? C.scale.usingRoom(cal.roomName ?? '', one((cal.metresPerPx ?? 0) > 0 ? 0 : 0))
          : C.scale.unmeasured;
    // The honest limit of an area-solved scale, said only when one is in use.
    sizedCaveat.textContent = cal.kind === 'epc' || cal.kind === 'room' ? C.scale.epcCaveat : '';
    sizedCaveat.hidden = sizedCaveat.textContent === '';

    status.textContent = s.phase === 'scale'
      ? (chosen === 'dimension' ? (s.scalePoints.length === 0 ? C.scale.tapFirst : s.scalePoints.length === 1 ? C.scale.tapSecond : C.scale.lengthLabel) : C.scale.prompt)
      : s.draft.length === 0 ? C.level.current(activeLevel(s).name) : C.trace.next;
  };
  sync(surface.state());
  return { element: box, sync };
}

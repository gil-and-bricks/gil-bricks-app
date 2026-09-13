/**
 * FLOOR PLAN — THE STATE MACHINE. No DOM, no SVG, no image, no strings.
 *
 * T2 REVERSED THE ORDER. T1 asked for the scale first and stopped dead on the
 * majority of real plans, which carry no printed dimension. You now TRACE
 * FIRST, in whatever units the image happens to be in, and choose how to size
 * it afterwards from whatever is actually available.
 *
 * T2 ALSO MADE LEVELS FIRST-CLASS. A UK agent plan nearly always puts ground,
 * first and sometimes a loft on ONE image, side by side. Tracing across them
 * would merge two storeys into one floorplan and produce a nonsense total —
 * worse than no answer. So a level owns its rooms, the property total is the
 * sum of the levels, and the EPC figure is solved against that sum because it
 * covers the whole dwelling.
 *
 * ONE RULE THROUGHOUT: corners are stored in IMAGE pixels, so zoom and pan
 * change what you see and never what you traced. Finger tolerances are compared
 * in SCREEN pixels, because those are about hands.
 */
import { FLOORPLAN_LEVELS, FLOORPLAN_TOLERANCES as T } from './config';
import {
  areaReading, closesRoom, distance, hitPoint, metresPerPixel, moveWall, scaleFromKnownArea,
  shoelaceArea, splitPolygon, toImage, toScreen, totalPx2,
  type AreaReading, type Pt, type ViewTransform,
} from './geometry';

export interface Room { id: string; name: string; points: Pt[] }
export interface Level { id: string; name: string; rooms: Room[] }

/** How the plan was sized. `none` is a real, honest answer. */
export type CalibrationKind = 'none' | 'dimension' | 'epc' | 'room';

export interface Calibration {
  kind: CalibrationKind;
  /** The one number everything is measured with. Null until sized. */
  metresPerPx: number | null;
  /** For 'dimension': the real length the user typed. */
  dimensionMetres?: number;
  /** For 'epc': the figure used and where it came from. */
  knownSqm?: number;
  knownSource?: string;
  /** For 'room': which room, and how big they said it is. */
  roomId?: string;
  roomName?: string;
}

export type Phase = 'trace' | 'scale';

export interface TracerState {
  phase: Phase;
  levels: Level[];
  activeLevel: number;
  /** The room being traced right now, in image px. */
  draft: Pt[];
  /** What a finger is holding: a draft corner, or one of a finished room. */
  dragging: { room: string | null; index: number } | null;
  /** The two ends of a printed dimension, while that calibration is chosen. */
  scalePoints: Pt[];
  calibration: Calibration;
  /** A total floor area we already hold, offered as a calibration. */
  known: { sqm: number; source: string } | null;
  view: ViewTransform;
  /** T2 — the zoom nudge is said once and then never again. */
  zoomPrompted: boolean;
  error: string | null;
}

let seq = 0;
const id = (prefix: string): string => `${prefix}${++seq}`;

export function initialState(known: { sqm: number; source: string } | null = null): TracerState {
  return {
    phase: 'trace',
    levels: [{ id: id('l'), name: FLOORPLAN_LEVELS[0], rooms: [] }],
    activeLevel: 0,
    draft: [],
    dragging: null,
    scalePoints: [],
    calibration: { kind: 'none', metresPerPx: null },
    known,
    view: { scale: 1, tx: 0, ty: 0 },
    zoomPrompted: false,
    error: null,
  };
}

const clampZoom = (s: number): number => Math.min(Math.max(s, T.minZoom), T.maxZoom);

export function pan(s: TracerState, dx: number, dy: number): TracerState {
  return { ...s, view: { ...s.view, tx: s.view.tx + dx, ty: s.view.ty + dy } };
}

/** Zoom about the pinch midpoint, so the plan under the fingers stays put. */
export function zoomAbout(s: TracerState, centre: Pt, factor: number): TracerState {
  const next = clampZoom(s.view.scale * factor);
  const applied = next / s.view.scale;
  return {
    ...s,
    zoomPrompted: true,
    view: {
      scale: next,
      tx: centre.x - (centre.x - s.view.tx) * applied,
      ty: centre.y - (centre.y - s.view.ty) * applied,
    },
  };
}

export const activeLevel = (s: TracerState): Level => s.levels[s.activeLevel];
export const draftScreen = (s: TracerState): Pt[] => s.draft.map((p) => toScreen(p, s.view));

/** Every corner currently on screen for the active level's finished rooms. */
export function roomScreens(s: TracerState): { room: Room; pts: Pt[] }[] {
  return activeLevel(s).rooms.map((room) => ({ room, pts: room.points.map((p) => toScreen(p, s.view)) }));
}

/**
 * A tap while tracing. In order:
 *   1. close the room, on the first corner, once there are enough;
 *   2. ADJUST a corner already placed — T2, see below;
 *   3. place a new corner.
 *
 * T2 CHANGED RULE 2. T1 refused to let a corner be adjusted until the room was
 * closed, so a fumble halfway round meant undoing everything back to it. The
 * reason was real — a near-tap grabbing a neighbour would deform the room — but
 * the cure was worse than the disease. The fix is a TIGHTER radius, not a
 * refusal: `adjustRadiusPx` is deliberately smaller than `grabRadiusPx`, so a
 * deliberate press on a visible dot adjusts, while an ordinary tap a finger's
 * width away still places. It is also smaller than any wall anyone traces, so
 * the ambiguous case barely exists.
 */
export function tapTrace(s: TracerState, screen: Pt): TracerState {
  if (s.phase !== 'trace') return s;
  const pts = draftScreen(s);
  if (pts.length > 0 && closesRoom(screen, pts[0], T.closeRadiusPx, s.draft.length, T.minPoints)) {
    return commitRoom(s);
  }
  const adjust = hitPoint(screen, pts, T.adjustRadiusPx);
  if (adjust !== null) return { ...s, dragging: { room: null, index: adjust }, error: null };
  return { ...s, draft: [...s.draft, snapped(s, screen)], error: null };
}

/**
 * T2 — a new corner lands EXACTLY on a nearby finished corner if there is one.
 *
 * Adjacent rooms share walls: a lounge and a kitchen meet on a party wall, and
 * both traces want the same two corners. Without snapping that wall is traced
 * twice a few pixels apart, and the two rooms overlap or leave a sliver — which
 * then quietly distorts every area solved from their total.
 */
export function snapped(s: TracerState, screen: Pt): Pt {
  for (const { room, pts } of roomScreens(s)) {
    const i = hitPoint(screen, pts, T.snapRadiusPx);
    if (i !== null) return room.points[i];
  }
  return toImage(screen, s.view);
}

/**
 * Press and hold to move a corner. Draft corners use the tight adjust radius;
 * corners of a finished room use the wider grab radius, because there a touch
 * on a dot can mean nothing else.
 *
 * IT NEVER GRABS THE CORNER THAT CLOSES THE ROOM. Once there are enough corners,
 * the first one IS the close target and the screen says so by growing it. If a
 * press picked it up instead, the closing tap would be swallowed as a drag and
 * the room could not be finished by tapping at all — which is exactly what
 * happened the moment mid-trace adjusting was added.
 */
export function grab(s: TracerState, screen: Pt): TracerState {
  const draftPts = draftScreen(s);
  const closable = s.draft.length >= T.minPoints;
  const draftHit = hitPoint(screen, draftPts, T.adjustRadiusPx);
  if (draftHit !== null && !(closable && draftHit === 0)) {
    return { ...s, dragging: { room: null, index: draftHit }, error: null };
  }
  if (draftHit === 0 && closable) return s;
  // A FINISHED room's corner is deliberately NOT grabbed here. Starting the next
  // room on a shared corner is the commonest thing anyone does on a floorplan,
  // and picking the old corner up instead dragged the previous room out of
  // shape. Those corners SNAP (see `snapped`); to change one, Undo reopens the
  // last room as a draft, where every corner is adjustable again.
  return s;
}

export function moveHeld(s: TracerState, screen: Pt): TracerState {
  if (s.dragging === null) return s;
  const img = toImage(screen, s.view);
  if (s.dragging.room === null) {
    const draft = [...s.draft];
    draft[s.dragging.index] = img;
    return { ...s, draft };
  }
  const levels = s.levels.map((lv, li) => (li !== s.activeLevel ? lv : {
    ...lv,
    rooms: lv.rooms.map((r) => (r.id !== s.dragging!.room ? r
      : { ...r, points: r.points.map((p, pi) => (pi === s.dragging!.index ? img : p)) })),
  }));
  return { ...s, levels };
}

export const release = (s: TracerState): TracerState => (s.dragging === null ? s : { ...s, dragging: null });

/** Finish the draft and add it to the active level. */
export function commitRoom(s: TracerState): TracerState {
  if (s.draft.length < T.minPoints) return s;
  const level = activeLevel(s);
  const room: Room = { id: id('r'), name: `Room ${level.rooms.length + 1}`, points: s.draft };
  const levels = s.levels.map((lv, i) => (i === s.activeLevel ? { ...lv, rooms: [...lv.rooms, room] } : lv));
  return { ...s, levels, draft: [], dragging: null, error: null };
}

/**
 * Undo. Takes back the last draft corner; with an empty draft it takes back the
 * whole last room, because that is plainly what "undo" means at that moment.
 */
export function undo(s: TracerState): TracerState {
  if (s.draft.length > 0) return { ...s, draft: s.draft.slice(0, -1), dragging: null, error: null };
  const level = activeLevel(s);
  if (level.rooms.length === 0) return s;
  const last = level.rooms[level.rooms.length - 1];
  const levels = s.levels.map((lv, i) => (i === s.activeLevel ? { ...lv, rooms: lv.rooms.slice(0, -1) } : lv));
  // Put it back as a draft rather than destroying it: undo after closing almost
  // always means "I closed it one corner too early".
  return { ...s, levels, draft: last.points, dragging: null, error: null };
}

export const clearDraft = (s: TracerState): TracerState => ({ ...s, draft: [], dragging: null, error: null });

export function renameRoom(s: TracerState, roomId: string, name: string): TracerState {
  const clean = name.trim().slice(0, 60);
  if (clean === '') return s;
  return {
    ...s,
    levels: s.levels.map((lv) => ({ ...lv, rooms: lv.rooms.map((r) => (r.id === roomId ? { ...r, name: clean } : r)) })),
  };
}

// --- levels ----------------------------------------------------------------

export function selectLevel(s: TracerState, index: number): TracerState {
  if (index < 0 || index >= s.levels.length) return s;
  return { ...s, activeLevel: index, draft: [], dragging: null, error: null };
}

/** Add the next unused standard level, or a numbered one once they run out. */
export function addLevel(s: TracerState): TracerState {
  const used = new Set(s.levels.map((l) => l.name));
  const next = FLOORPLAN_LEVELS.find((n) => !used.has(n)) ?? `Level ${s.levels.length + 1}`;
  const levels = [...s.levels, { id: id('l'), name: next, rooms: [] }];
  return { ...s, levels, activeLevel: levels.length - 1, draft: [], error: null };
}

export function renameLevel(s: TracerState, index: number, name: string): TracerState {
  const clean = name.trim().slice(0, 40);
  if (clean === '' || index < 0 || index >= s.levels.length) return s;
  return { ...s, levels: s.levels.map((lv, i) => (i === index ? { ...lv, name: clean } : lv)) };
}

// --- calibration, which now happens AFTER tracing ---------------------------

export const tracedRooms = (s: TracerState): Room[] => s.levels.flatMap((l) => l.rooms);
/** Unscaled area of everything traced, in square image pixels. */
export const tracedPx2 = (s: TracerState): number => totalPx2(tracedRooms(s).map((r) => r.points));

export function beginScale(s: TracerState): TracerState {
  if (tracedRooms(s).length === 0) return s;
  return { ...s, phase: 'scale', draft: [], dragging: null, error: null };
}

export const backToTrace = (s: TracerState): TracerState => ({ ...s, phase: 'trace', scalePoints: [], error: null });

export function tapScale(s: TracerState, screen: Pt): TracerState {
  if (s.phase !== 'scale') return s;
  const img = toImage(screen, s.view);
  if (s.scalePoints.length >= 2) return { ...s, scalePoints: [img], error: null };
  return { ...s, scalePoints: [...s.scalePoints, img], error: null };
}

/** Calibrate from a printed dimension the user tapped the ends of. */
export function useDimension(s: TracerState, metres: number, tooShort: string): TracerState {
  if (s.scalePoints.length < 2) return { ...s, error: tooShort };
  const [a, b] = s.scalePoints;
  if (distance(toScreen(a, s.view), toScreen(b, s.view)) < T.minScalePx) return { ...s, error: tooShort };
  const mpp = metresPerPixel(a, b, metres, 0);
  if (mpp === null) return { ...s, error: tooShort };
  return { ...s, calibration: { kind: 'dimension', metresPerPx: mpp, dimensionMetres: metres }, error: null };
}

/**
 * Calibrate so the WHOLE PROPERTY matches a figure we already hold. Solved
 * against every level together, because the EPC figure covers the dwelling.
 */
export function useKnownTotal(s: TracerState, needTrace: string): TracerState {
  if (s.known === null) return s;
  const px2 = tracedPx2(s);
  const mpp = scaleFromKnownArea(px2, s.known.sqm);
  if (mpp === null) return { ...s, error: needTrace };
  return {
    ...s,
    calibration: { kind: 'epc', metresPerPx: mpp, knownSqm: s.known.sqm, knownSource: s.known.source },
    error: null,
  };
}

/** Calibrate from one room the user knows the size of. */
export function useKnownRoom(s: TracerState, roomId: string, sqm: number, needRoom: string): TracerState {
  const room = tracedRooms(s).find((r) => r.id === roomId);
  if (room === undefined) return { ...s, error: needRoom };
  const mpp = scaleFromKnownArea(shoelaceArea(room.points), sqm);
  if (mpp === null) return { ...s, error: needRoom };
  return { ...s, calibration: { kind: 'room', metresPerPx: mpp, roomId, roomName: room.name, knownSqm: sqm }, error: null };
}

/** Leave it unmeasured, honestly. The shapes are kept; no areas are claimed. */
export const useNothing = (s: TracerState): TracerState =>
  ({ ...s, calibration: { kind: 'none', metresPerPx: null }, error: null });

// --- readings ---------------------------------------------------------------

export function roomReading(s: TracerState, room: Room): AreaReading | null {
  const mpp = s.calibration.metresPerPx;
  if (mpp === null) return null;
  return areaReading(room.points, mpp, T.areaTolerancePct);
}

export function levelSqm(s: TracerState, index: number): number | null {
  const mpp = s.calibration.metresPerPx;
  if (mpp === null || index < 0 || index >= s.levels.length) return null;
  const px2 = totalPx2(s.levels[index].rooms.map((r) => r.points));
  return Math.round(px2 * mpp * mpp * 10) / 10;
}

/** The property total: every level added together. */
export function propertySqm(s: TracerState): number | null {
  const mpp = s.calibration.metresPerPx;
  if (mpp === null) return null;
  return Math.round(tracedPx2(s) * mpp * mpp * 10) / 10;
}

/** The wall being drawn, in metres — only once there is a scale to say it in. */
export function lastWallMetres(s: TracerState): number | null {
  const mpp = s.calibration.metresPerPx;
  if (mpp === null || s.draft.length < 2) return null;
  return distance(s.draft[s.draft.length - 2], s.draft[s.draft.length - 1]) * mpp;
}

// --- F1: partitions, wall moves, and saving --------------------------------

/**
 * F1 — SPLIT A ROOM WITH A PARTITION. Two taps on opposite walls; the room
 * becomes two rooms, both measured at once. This is the question most of these
 * drawings are made to answer, so it is two taps and no dialog.
 */
export function partition(s: TracerState, roomId: string, p1: Pt, p2: Pt, failed: string): TracerState {
  const level = activeLevel(s);
  const room = level.rooms.find((r) => r.id === roomId);
  if (room === undefined) return { ...s, error: failed };
  const halves = splitPolygon(room.points, p1, p2);
  if (halves === null) return { ...s, error: failed };
  const [a, b] = halves;
  const rooms = level.rooms.flatMap((r) => (r.id !== roomId ? [r] : [
    { ...r, points: a },
    { id: id('r'), name: `${r.name} B`, points: b },
  ]));
  return {
    ...s,
    levels: s.levels.map((lv, i) => (i === s.activeLevel ? { ...lv, rooms } : lv)),
    error: null,
  };
}

/** Which room a point is inside, if any. Ray casting; no library. */
export function roomAt(s: TracerState, img: Pt): Room | null {
  for (const room of activeLevel(s).rooms) {
    let inside = false;
    const pts = room.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if ((a.y > img.y) !== (b.y > img.y)
        && img.x < ((b.x - a.x) * (img.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    if (inside) return room;
  }
  return null;
}

/** F1 — move a whole wall, so the room stays square. */
export function nudgeWall(s: TracerState, roomId: string, edge: number, dx: number, dy: number): TracerState {
  return {
    ...s,
    levels: s.levels.map((lv, i) => (i !== s.activeLevel ? lv : {
      ...lv,
      rooms: lv.rooms.map((r) => (r.id !== roomId ? r : { ...r, points: moveWall(r.points, edge, dx, dy) })),
    })),
  };
}

/**
 * F1 — THE SAVED SHAPE. Geometry only: points, names, levels and how it was
 * sized. No image, no URL, nothing from which a picture could be rebuilt. This
 * is what goes in D1 and what comes back when the deal is reopened, which is
 * the whole reason the plan is stored as geometry rather than as pixels.
 */
export interface SavedPlan {
  v: 1;
  levels: { name: string; rooms: { name: string; points: Pt[] }[] }[];
  /** Metres per image pixel, so the drawing reads the same size when reopened. */
  mpp: number | null;
  sizedBy: CalibrationKind;
  knownSqm?: number;
  knownSource?: string;
  dimensionMetres?: number;
}

export function toSaved(s: TracerState): SavedPlan {
  return {
    v: 1,
    levels: s.levels.map((lv) => ({
      name: lv.name,
      rooms: lv.rooms.map((r) => ({ name: r.name, points: r.points.map((p) => ({ x: p.x, y: p.y })) })),
    })),
    mpp: s.calibration.metresPerPx,
    sizedBy: s.calibration.kind,
    ...(s.calibration.knownSqm === undefined ? {} : { knownSqm: s.calibration.knownSqm }),
    ...(s.calibration.knownSource === undefined ? {} : { knownSource: s.calibration.knownSource }),
    ...(s.calibration.dimensionMetres === undefined ? {} : { dimensionMetres: s.calibration.dimensionMetres }),
  };
}

/**
 * Restore a saved plan. The BACKDROP IS NOT NEEDED: every room is stored in the
 * same image-pixel space it was drawn in, and the scale travels with it, so the
 * drawing renders and measures identically with no picture behind it at all.
 */
export function fromSaved(saved: SavedPlan, known: { sqm: number; source: string } | null): TracerState {
  const base = initialState(known);
  if (saved.v !== 1 || !Array.isArray(saved.levels) || saved.levels.length === 0) return base;
  return {
    ...base,
    levels: saved.levels.map((lv) => ({
      id: id('l'),
      name: String(lv.name ?? '').slice(0, 40) || FLOORPLAN_LEVELS[0],
      rooms: (lv.rooms ?? []).map((r) => ({
        id: id('r'),
        name: String(r.name ?? '').slice(0, 60) || 'Room',
        points: (r.points ?? []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
          .map((p) => ({ x: Number(p.x), y: Number(p.y) })),
      })).filter((r) => r.points.length >= 3),
    })),
    calibration: {
      kind: saved.sizedBy ?? 'none',
      metresPerPx: typeof saved.mpp === 'number' && saved.mpp > 0 ? saved.mpp : null,
      knownSqm: saved.knownSqm,
      knownSource: saved.knownSource,
      dimensionMetres: saved.dimensionMetres,
    },
  };
}

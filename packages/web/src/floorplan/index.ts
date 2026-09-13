/**
 * FLOOR PLAN — THE ONLY DOOR IN OR OUT OF THIS MODULE (F1).
 *
 * ── WHAT IT IS ──────────────────────────────────────────────────────────────
 * Redrawing a property's layout: to test whether another bedroom or bathroom
 * fits, to move rooms about, or simply to keep a clean measured copy of the
 * plan with the deal. "Tracing" is the chore; this is the point.
 *
 * ── THE BOUNDARY ────────────────────────────────────────────────────────────
 * Nothing outside `src/floorplan/` imports anything from inside it except what
 * this file exports, and the module imports nothing from the rest of the web
 * app. Tests enforce both, so it can be deleted whole.
 *
 * (It MAY import `@gil-bricks/core`: that is the shared maths package the
 * charter already puts every calculation in, it ships to every surface anyway,
 * and depending on it does not stop this module being removed in one cut.)
 *
 * ── THE IMAGE NEVER REACHES OUR SERVERS ─────────────────────────────────────
 * The backdrop is `<image href="https://…portal CDN…">` — the agent's own
 * server, addressed by a URL the extension carried over in the handoff exactly
 * as it carries the price and the beds. The browser fetches it the same way the
 * listing page did. We never hold the bytes, so there is nothing to send: no
 * canvas, no blob, no data URI, no fetch. Tests fail the build on every one of
 * those APIs appearing anywhere in this directory.
 *
 * WHAT IS STORED IS GEOMETRY: points, walls, rooms, names, numbers. What is
 * PRINTED and SHARED is our own rendering of that geometry — never the portal's
 * picture, which is why a saved plan still draws when the backdrop is gone.
 */
import { FLOORPLAN_COPY, FLOORPLAN_TOLERANCES } from './config';
import { areaReading, shoelaceArea } from './geometry';
import { fromSaved, levelSqm, propertySqm, roomReading, toSaved, tracedRooms, type SavedPlan, type TracerState } from './plan';

export type { SavedPlan } from './plan';

/** F1 — one room, as the rest of the product may know it. */
export interface PlannedRoom {
  readonly name: string;
  readonly level: string;
  readonly areaSqm: number;
  readonly areaLowSqm: number;
  readonly areaHighSqm: number;
}

/** F1 — the whole plan. Strings and numbers; no picture is reconstructible. */
export interface PlannedFloors {
  readonly rooms: readonly PlannedRoom[];
  readonly levels: readonly { readonly name: string; readonly areaSqm: number }[];
  readonly totalSqm: number;
  readonly sizedBy: 'dimension' | 'epc' | 'room' | 'none';
}

export function planFrom(state: TracerState): PlannedFloors | null {
  const total = propertySqm(state);
  if (total === null || tracedRooms(state).length === 0) return null;
  const rooms: PlannedRoom[] = [];
  for (const level of state.levels) {
    for (const room of level.rooms) {
      const r = roomReading(state, room);
      if (r === null) continue;
      // Field by field on purpose: spreading state is how something that should
      // not leave would one day leave.
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

/** Geometry for storage. Never called with anything but state. */
export const toStorable = (state: TracerState): SavedPlan => toSaved(state);
export const fromStorable = (saved: SavedPlan, known: { sqm: number; source: string } | null): TracerState =>
  fromSaved(saved, known);

/**
 * F1 — THE SHARE MESSAGE. Built only from names and numbers this module
 * computed. A test asserts no URL, no image reference and nothing from the
 * portal can appear in it.
 */
export function shareText(plan: PlannedFloors, address: string): string {
  const rooms = plan.rooms
    .map((r) => FLOORPLAN_COPY.share.room(r.name, r.areaSqm.toFixed(1)))
    .join('\n');
  return FLOORPLAN_COPY.share.message(address, plan.totalSqm.toFixed(1), rooms);
}

/**
 * F1 — THE PRINT SHEET, as pure data. The page that renders it owns the SVG;
 * this owns what is true. Deliberately returns geometry in its own units plus
 * the numbers, so the sheet can draw OUR plan and never the agent's image.
 */
export interface PrintLevel {
  readonly name: string;
  readonly totalSqm: number;
  readonly rooms: readonly {
    readonly name: string;
    readonly areaSqm: number;
    /** Our own outline, in the plan's own coordinates. Not a picture. */
    readonly points: readonly { readonly x: number; readonly y: number }[];
  }[];
}

export interface PrintSheet {
  readonly levels: readonly PrintLevel[];
  readonly totalSqm: number;
  readonly sizedBy: 'dimension' | 'epc' | 'room' | 'none';
}

export function printSheet(state: TracerState): PrintSheet | null {
  const total = propertySqm(state);
  if (total === null) return null;
  const levels: PrintLevel[] = [];
  state.levels.forEach((lv, i) => {
    if (lv.rooms.length === 0) return;
    levels.push({
      name: lv.name,
      totalSqm: levelSqm(state, i) ?? 0,
      rooms: lv.rooms.map((r) => ({
        name: r.name,
        areaSqm: roomReading(state, r)?.sqm ?? 0,
        points: r.points.map((p) => ({ x: p.x, y: p.y })),
      })),
    });
  });
  return { levels, totalSqm: total, sizedBy: state.calibration.kind };
}

/**
 * F1 — does this room clear the HMO single-adult minimum the product already
 * uses? The threshold is the product's, not this module's invention.
 */
export function meetsHmoMinimum(areaSqm: number, minimumSqm: number): boolean {
  return areaSqm >= minimumSqm;
}

/** A URL we will display: the agent's, over https, never bytes we are holding. */
export function isDisplayableImageUrl(url: string): boolean {
  if (typeof url !== 'string' || url.trim() === '') return false;
  const lowered = url.trim().toLowerCase();
  if (/^(blob:|data:|filesystem:)/.test(lowered)) return false;
  return /^https:\/\//.test(lowered);
}

export { FLOORPLAN_COPY, FLOORPLAN_TOLERANCES };
export { areaReading, shoelaceArea };

/**
 * The mountable surface, re-exported so the ONE component that hosts this
 * feature imports from the door and never from inside. Keeping it here rather
 * than letting the host reach into ./view is what makes "one typed interface"
 * true rather than nearly true.
 */
export { createSurface, createChrome, type Surface, type SurfaceOptions } from './view';

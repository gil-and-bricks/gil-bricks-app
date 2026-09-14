/**
 * DP1 — THE DEAL'S OWN FLOOR PLAN, ready for the pack.
 *
 * WHAT GOES IN IS GEOMETRY AND WHAT COMES OUT IS GEOMETRY. The agent's floor
 * plan image is never fetched, never stored and never embedded: F1 saves the
 * rooms the user traced, in their own coordinates, and this turns those into
 * the shape the document draws. There is no image anywhere in this path and no
 * URL for one to arrive by.
 *
 * IT FORMATS, IT DOES NOT MEASURE. Every area comes from `printSheet()` in the
 * floor-plan module, which is where the maths lives.
 */
import { fromStorable, printSheet, type SavedPlan } from '../../floorplan';
import { PACK_COPY } from '../../config/pack';
import type { PackFloorPlan } from '../../components/pack/PackDocument';

const one = (n: number): string => PACK_COPY.property.sqm(n.toFixed(1));

/**
 * The plan a deal has saved, as the pack draws it — or null when there is none,
 * when it cannot be read, or when it holds no room worth printing.
 */
export function packFloorPlan(raw: string | null): PackFloorPlan | null {
  if (raw === null || raw.trim() === '') return null;
  let saved: SavedPlan;
  try {
    saved = JSON.parse(raw) as SavedPlan;
  } catch {
    return null;
  }
  let sheet: ReturnType<typeof printSheet>;
  try {
    sheet = printSheet(fromStorable(saved, null));
  } catch {
    return null;
  }
  if (sheet === null || sheet.levels.length === 0) return null;
  return {
    total: one(sheet.totalSqm),
    levels: sheet.levels.map((level) => ({
      name: level.name,
      totalSqm: one(level.totalSqm),
      rooms: level.rooms.map((room) => ({
        name: room.name,
        area: one(room.areaSqm),
        points: room.points.map((p) => ({ x: p.x, y: p.y })),
      })),
    })),
  };
}

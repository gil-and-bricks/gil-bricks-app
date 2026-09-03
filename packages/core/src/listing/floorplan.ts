/**
 * Floor-plan measurement + manual dimension helpers (E9 → E9.1). OCR was cut
 * (real UK agent plans too rarely carry readable dimensions), so this is now the
 * PURE logic behind the client-side MEASURE overlay and manual dimension entry:
 * parse a dimension the user types, check a room against the England HMO minimums,
 * and do the scale/measure/rectangle geometry. No network, no image handling.
 */
import { sqmToSqft } from '../maths/area';
export { sqmToSqft };

/**
 * England statutory HMO minimum room sizes (The Licensing of Houses in Multiple
 * Occupation (Mandatory Conditions of Licences) (England) Regulations 2018).
 * Floor area under a 1.5m ceiling height is excluded by the regs — we CANNOT see
 * ceiling heights on a plan, so these are an INDICATION, not a survey.
 */
export const HMO_MIN_SQM = {
  childUnder10: 4.64,
  oneAdultOver10: 6.51,
  twoAdultsOver10: 10.22,
} as const;

/**
 * The honest caveat attached wherever a MEASURED room-fit result is stated
 * (E9.1 review): a measurement is an indication, not a survey — floor under a
 * sloped ceiling below 1.5 m doesn't count toward the statutory size and some
 * councils set higher minimums via additional licensing. Never dropped from a
 * measured "pass" so the pass is never read as flat legal compliance.
 */
export const ROOM_FIT_CAVEAT =
  'An indication from your measurements, not a survey — floor under a 1.5 m ceiling doesn’t count and some councils set higher minimums.';

export type DimUnit = 'm' | 'ft';

const round2 = (n: number): number => Math.round(n * 100) / 100;
/** feet + inches → metres. */
const ftInToM = (feet: number, inches: number): number => (feet * 12 + inches) * 0.0254;

interface Side { metres: number; unit: DimUnit; bare: boolean }
/**
 * Parse the FIRST length in one side of a dimension the user typed. Handles
 * metric-with-unit ("3.50m"), imperial ("11'6\"", "13'9"), a metric value with an
 * imperial gloss in parens ("3.50m (11'6\")" — metric wins), and a bare number.
 */
function parseSide(raw: string): Side | null {
  const s = raw.replace(/[”″]/g, '"').replace(/[’‘`]/g, "'").trim();
  const metU = /(\d{1,2}(?:\.\d{1,2})?)\s*(?:m\b|metres?|meters?)/i.exec(s);
  if (metU) {
    const n = Number(metU[1]);
    if (n > 0 && n < 30) return { metres: n, unit: 'm', bare: false };
  }
  const imp = /(\d{1,2})\s*'\s*(\d{1,2})?/.exec(s);
  if (imp) {
    const inches = imp[2] ? Number(imp[2]) : 0;
    if (inches < 12) return { metres: ftInToM(Number(imp[1]), inches), unit: 'ft', bare: false };
  }
  const bare = /(\d{1,2}(?:\.\d{1,2})?)/.exec(s);
  if (bare) {
    const n = Number(bare[1]);
    if (n > 0 && n < 60) return { metres: n, unit: 'm', bare: true };
  }
  return null;
}

/** A room side is 1.2–25 m and its area 2–90 m² — used to reject implausible parses. */
function plausibleRoom(widthM: number, lengthM: number): boolean {
  const area = widthM * lengthM;
  return widthM >= 1.2 && widthM <= 25 && lengthM >= 1.2 && lengthM <= 25 && area >= 2 && area <= 90;
}

/**
 * Parse a dimension PAIR the user typed, e.g. "3.50m x 4.20m", "11'6\" x 13'9\"",
 * "3.5 x 4.2". Prefers metric on mixed lines; treats an OCR/typo comma as a
 * decimal; strips a leading label/room-number; refuses ambiguous bare-integer
 * pairs (plausible as both m and ft) rather than guess. Null when unreadable.
 */
export function parseDimensionPair(raw: string): { widthM: number; lengthM: number; unit: DimUnit; text: string } | null {
  const cleaned = raw
    .replace(/approx(?:\.|imately)?/gi, ' ')
    .replace(/[×X]/g, 'x')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim();
  const m = /^(.*?\d[^x]*?)\s*x\s*(.+)$/i.exec(cleaned);
  if (!m) return null;
  const stripLead = (side: string): string => side.slice(Math.max(0, side.search(/\d/))).replace(/^\d{1,2}\s+(?=\d)/, '');
  const leftSide = stripLead(m[1]);
  const rightSide = stripLead(m[2]);
  const a = parseSide(leftSide);
  const b = parseSide(rightSide);
  if (!a || !b) return null;
  let widthM = a.metres;
  let lengthM = b.metres;
  let unit: DimUnit = a.unit === b.unit ? a.unit : 'm';
  if (a.bare && b.bare && !/\./.test(leftSide) && !/\./.test(rightSide)) {
    const metresOk = plausibleRoom(widthM, lengthM);
    const fw = ftInToM(widthM, 0);
    const fl = ftInToM(lengthM, 0);
    const feetOk = plausibleRoom(fw, fl);
    if (feetOk && !metresOk) { widthM = fw; lengthM = fl; unit = 'ft'; }
    else if (feetOk && metresOk) return null; // ambiguous → let the user resolve it
  }
  const text = `${leftSide.trim()} x ${rightSide.trim()}`.replace(/\s+/g, ' ');
  return { widthM: round2(widthM), lengthM: round2(lengthM), unit, text };
}

export interface RoomFit {
  meetsChild: boolean;
  meetsOneAdult: boolean;
  meetsTwoAdults: boolean;
}
/** England statutory-minimum room-fit for one room area (an indication, not a survey). */
export function roomFit(areaSqm: number): RoomFit {
  return {
    meetsChild: areaSqm >= HMO_MIN_SQM.childUnder10,
    meetsOneAdult: areaSqm >= HMO_MIN_SQM.oneAdultOver10,
    meetsTwoAdults: areaSqm >= HMO_MIN_SQM.twoAdultsOver10,
  };
}

// ---------------- measure / reconfigure overlay geometry ----------------

/** Metres-per-pixel from dragging along a known real-world length. */
export function metresPerPixel(dragPx: number, knownMetres: number): number | null {
  if (!(dragPx > 0) || !(knownMetres > 0)) return null;
  return knownMetres / dragPx;
}
/** A measured pixel length → metres. */
export function measureMetres(px: number, mPerPx: number): number {
  return round2(px * mPerPx);
}
/** A drawn rectangle (pixels) → area in m² (and whether a bedroom would fit). */
export function rectArea(widthPx: number, heightPx: number, mPerPx: number): { widthM: number; lengthM: number; areaSqm: number; fit: RoomFit } {
  const widthM = round2(Math.abs(widthPx) * mPerPx);
  const lengthM = round2(Math.abs(heightPx) * mPerPx);
  const areaSqm = round2(widthM * lengthM);
  return { widthM, lengthM, areaSqm, fit: roomFit(areaSqm) };
}

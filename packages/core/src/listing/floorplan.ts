/**
 * Floor-plan reading (E9) — PURE logic shared by the extension's offline OCR.
 * No network, no image handling here: the panel does the OCR (Tesseract.js,
 * bundled offline) and canvas work; this module turns the recognised TEXT into
 * honestly-graded room dimensions, converts units, checks HMO room-fit, and
 * does the measure-overlay geometry. Everything is testable without a browser.
 *
 * Honesty rules baked in: the total is the "sum of the rooms we could read"
 * (never GIA — corridors, stairs and unreadable rooms are excluded); a value we
 * can't parse is dropped, never guessed; every room carries a confidence.
 */

import { sqmToSqft } from '../maths/area';

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

export type DimUnit = 'm' | 'ft';
export type RoomConfidence = 'high' | 'medium' | 'low';

export interface RoomDim {
  /** Room name where a label was readable above/beside the dimensions. */
  name: string | null;
  /** The dimension text exactly as read (so the user can sanity-check it). */
  raw: string;
  widthM: number;
  lengthM: number;
  areaSqm: number;
  areaSqft: number;
  /** The convention the dimensions were written in. */
  unit: DimUnit;
  confidence: RoomConfidence;
  /** True once the user has corrected the value — then it's THEIRS, not ours. */
  edited?: boolean;
}

export interface FloorPlanRead {
  rooms: RoomDim[];
  /** Sum of the readable rooms' areas — NOT gross internal area. */
  sumSqm: number;
  sumSqft: number;
  /** Plain label for the total, e.g. "sum of 4 rooms we could read". */
  totalLabel: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
/** sqm → whole ft², safe at 0 (maths.sqmToSqft asserts > 0). */
const toSqft = (sqm: number): number => (sqm > 0 ? Math.round(sqmToSqft(sqm)) : 0);

/** feet + inches → metres. */
const ftInToM = (feet: number, inches: number): number => (feet * 12 + inches) * 0.0254;

interface Side { metres: number; unit: DimUnit; bare: boolean }
/**
 * Parse the FIRST length in one side of a dimension. Handles metric-with-unit
 * ("3.50m"), imperial ("11'6\"", "13'9"), a metric value with an imperial gloss
 * in parens ("3.50m (11'6\")" — metric wins), and a bare number ("4.2" → metres,
 * flagged so a bare-integer pair can be reinterpreted as feet if implausible).
 */
function parseSide(raw: string): Side | null {
  const s = raw.replace(/[”″]/g, '"').replace(/[’‘`]/g, "'").trim();
  // 1) metric with an explicit unit anywhere in the side.
  const metU = /(\d{1,2}(?:\.\d{1,2})?)\s*(?:m\b|metres?|meters?)/i.exec(s);
  if (metU) {
    const n = Number(metU[1]);
    if (n > 0 && n < 30) return { metres: n, unit: 'm', bare: false };
  }
  // 2) imperial feet' (optional inches").
  const imp = /(\d{1,2})\s*'\s*(\d{1,2})?/.exec(s);
  if (imp) {
    const inches = imp[2] ? Number(imp[2]) : 0;
    if (inches < 12) return { metres: ftInToM(Number(imp[1]), inches), unit: 'ft', bare: false };
  }
  // 3) a bare number → assume metres (a decimal is almost always metric).
  const bare = /(\d{1,2}(?:\.\d{1,2})?)/.exec(s);
  if (bare) {
    const n = Number(bare[1]);
    if (n > 0 && n < 60) return { metres: n, unit: 'm', bare: true };
  }
  return null;
}

/**
 * Parse a dimension PAIR like "3.50m x 4.20m", "11'6\" x 13'9\"", "3.5 x 4.2",
 * "3.50m (11'6\") x 4.20m (13'9\")". Prefers metric on mixed lines. Returns null
 * when it isn't a readable pair.
 */
export function parseDimensionPair(raw: string): { widthM: number; lengthM: number; unit: DimUnit; text: string } | null {
  const cleaned = raw
    .replace(/approx(?:\.|imately)?/gi, ' ')
    .replace(/[×X]/g, 'x')
    .replace(/(\d),(\d)/g, '$1.$2') // OCR often reads a decimal point as a comma
    .replace(/\s+/g, ' ')
    .trim();
  const at = cleaned.search(/\sx\s|x/i);
  if (at < 0) return null;
  // Split on the first standalone-ish 'x' between two numbers.
  const m = /^(.*?\d[^x]*?)\s*x\s*(.+)$/i.exec(cleaned);
  if (!m) return null;
  // Strip a leading room LABEL and a room-NUMBER token ("Bedroom 4 2.5" → "2.5")
  // from each side BEFORE parsing, so a numbered label is never read AS the width
  // and the displayed text always matches the computed area (E9 review, must-fix).
  const stripLead = (side: string): string => side.slice(Math.max(0, side.search(/\d/))).replace(/^\d{1,2}\s+(?=\d)/, '');
  const leftSide = stripLead(m[1]);
  const rightSide = stripLead(m[2]);
  const a = parseSide(leftSide);
  const b = parseSide(rightSide);
  if (!a || !b) return null;
  let widthM = a.metres;
  let lengthM = b.metres;
  let unit: DimUnit = a.unit === b.unit ? a.unit : 'm';
  // A bare-integer pair (no unit, no decimal) is ambiguous m vs ft. Reinterpret as
  // feet ONLY when feet is plausible and metres is NOT; when BOTH readings are
  // plausible, refuse to guess and fall back to manual entry — never a wrong number
  // (E9 review, must-fix: a feet-sized bedroom must not surface as a huge m² room).
  if (a.bare && b.bare && !/\./.test(leftSide) && !/\./.test(rightSide)) {
    const metresOk = plausibleRoom(widthM, lengthM);
    const fw = ftInToM(widthM, 0);
    const fl = ftInToM(lengthM, 0);
    const feetOk = plausibleRoom(fw, fl);
    if (feetOk && !metresOk) { widthM = fw; lengthM = fl; unit = 'ft'; }
    else if (feetOk && metresOk) return null; // ambiguous → manual entry
  }
  const text = `${leftSide.trim()} x ${rightSide.trim()}`.replace(/\s+/g, ' ');
  return { widthM: round2(widthM), lengthM: round2(lengthM), unit, text };
}

/** Plausibility: a real room side is 1.2–25 m and its area 2–90 m². */
function plausibleRoom(widthM: number, lengthM: number): boolean {
  const area = widthM * lengthM;
  return widthM >= 1.2 && widthM <= 25 && lengthM >= 1.2 && lengthM <= 25 && area >= 2 && area <= 90;
}

const NAME_RE = /(living|dining|kitchen|lounge|bed(?:room)?|reception|study|office|bath(?:room)?|shower|utility|conservatory|hall|landing|snug|family|master|room\s*\d|w\.?c)/i;

/**
 * Turn raw OCR text into readable rooms. Each dimension line becomes a room;
 * a nearby name (same line before the dims, else the previous text line) labels
 * it. Unreadable lines are dropped. `ocrConfidence` (0–100, from Tesseract) is
 * folded into each row's confidence when supplied.
 */
export function parseFloorPlan(text: string, ocrConfidence?: number): FloorPlanRead {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rooms: RoomDim[] = [];
  let pendingName: string | null = null;

  for (const line of lines) {
    const pair = parseDimensionPair(line);
    if (!pair) {
      // A text line with no dimensions is a candidate NAME for the next room.
      const nm = NAME_RE.exec(line);
      pendingName = nm ? tidyName(line) : (line.length <= 24 && /[a-z]/i.test(line) ? tidyName(line) : pendingName);
      continue;
    }
    // Name from the same line (text before the first digit) wins over the pending line.
    const before = line.slice(0, Math.max(0, line.search(/\d/))).trim();
    const inlineName = before && NAME_RE.test(before) ? tidyName(before) : null;
    const name = inlineName ?? pendingName;
    pendingName = null;

    const areaSqm = round2(pair.widthM * pair.lengthM);
    const plausible = plausibleRoom(pair.widthM, pair.lengthM);
    // An implausible parse (a 0.02 m² or 400 m² "room") is OCR noise, not a
    // low-confidence room — drop it rather than show a wrong number (E9).
    if (!plausible) { pendingName = null; continue; }
    rooms.push({
      name,
      raw: pair.text,
      widthM: pair.widthM,
      lengthM: pair.lengthM,
      areaSqm,
      areaSqft: toSqft(areaSqm),
      unit: pair.unit,
      confidence: gradeConfidence(plausible, !!name, ocrConfidence),
    });
  }

  return summarise(rooms);
}

function tidyName(s: string): string {
  return s.replace(/[^a-z0-9 .'/-]/gi, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 28) || 'Room';
}

function gradeConfidence(plausible: boolean, named: boolean, ocrConfidence?: number): RoomConfidence {
  if (!plausible) return 'low';
  if (ocrConfidence != null && ocrConfidence < 60) return 'low';
  if (ocrConfidence != null && ocrConfidence < 80) return 'medium';
  return named ? 'high' : 'medium';
}

/** Recompute the total after edits/adds/removes. */
export function summarise(rooms: RoomDim[]): FloorPlanRead {
  const sumSqm = round2(rooms.reduce((s, r) => s + r.areaSqm, 0));
  const n = rooms.length;
  return {
    rooms,
    sumSqm,
    sumSqft: toSqft(sumSqm),
    totalLabel: n === 0 ? 'no rooms read' : `sum of ${n} room${n === 1 ? '' : 's'} we could read`,
  };
}

/** A user-corrected room: recompute area, mark it as theirs, high confidence. */
export function editRoom(room: RoomDim, widthM: number, lengthM: number): RoomDim {
  const areaSqm = round2(widthM * lengthM);
  return { ...room, widthM: round2(widthM), lengthM: round2(lengthM), areaSqm, areaSqft: toSqft(areaSqm), edited: true, confidence: 'high' };
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

export interface RoomFitSummary {
  /** Rooms that meet the single-adult (>10yr) minimum of 6.51 m². */
  lettableAdultRooms: number;
  /** Rooms plausibly large enough only for a child / not lettable to an adult. */
  belowAdultMin: number;
  total: number;
  /** roomSizeFailures for the HMO score: rooms below the single-adult minimum. */
  failures: number;
}
export function roomFitSummary(rooms: RoomDim[]): RoomFitSummary {
  const lettableAdultRooms = rooms.filter((r) => roomFit(r.areaSqm).meetsOneAdult).length;
  return {
    lettableAdultRooms,
    belowAdultMin: rooms.length - lettableAdultRooms,
    total: rooms.length,
    failures: rooms.length - lettableAdultRooms,
  };
}

export type CrossCheck = 'consistent' | 'reads-higher' | 'reads-much-lower' | 'no-reference';
/**
 * Sanity-check the sum-of-rooms against a known floor area (EPC/listing). The
 * sum is ALWAYS a subset of GIA, so it should be lower; reading HIGHER than the
 * stated area is an OCR misread, and reading a tiny fraction means we only got
 * part of the plan. Honest, never asserts GIA.
 */
export function crossCheckArea(sumRoomsSqm: number, referenceSqm: number | null | undefined): { status: CrossCheck; deltaPct: number | null } {
  if (!referenceSqm || referenceSqm <= 0) return { status: 'no-reference', deltaPct: null };
  const ratio = sumRoomsSqm / referenceSqm;
  const deltaPct = Math.round((ratio - 1) * 100);
  if (ratio > 1.05) return { status: 'reads-higher', deltaPct };
  if (ratio < 0.4) return { status: 'reads-much-lower', deltaPct };
  return { status: 'consistent', deltaPct };
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

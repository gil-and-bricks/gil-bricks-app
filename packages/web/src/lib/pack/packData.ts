/**
 * DP2 — TURNING A SAVED DEAL INTO THE THINGS THE PAGES DRAW.
 *
 * Every figure here has already been worked out by @gil-bricks/core. What this
 * file does is SELECT and SHAPE: which figure leads, which four support it,
 * which steps the waterfall has. It does no arithmetic on a deal's numbers, and
 * where it needs a raw value for chart geometry it takes the one the engine
 * handed over rather than parsing a formatted string back into a number.
 */
import {
  MIN_TRANSACTIONS, fmtMoney, growthOver, historyPoints, bandEnds, trajectoryFor,
  codesForSector, type AreaCodesFile, type Comp, type EvidencedFigure, type PackNumbers,
  type TrajectoryFile,
} from '@gil-bricks/core';
import { PACK_COPY } from '../../config/pack';
import type { CompRow } from '../../components/pack/PackDocument';
import type { WaterfallStep, GrowthPoint } from '../../components/pack/charts/Charts';

/**
 * THE HERO AND ITS SUPPORTING CAST.
 *
 * The hero is the first headline figure the engine produced — for a flip or a
 * BRRRR that is the end value, for a let it is what it returns. Everything else
 * that is not the hero becomes the strip beneath it, deduplicated by label so a
 * figure that appears in both headline and returns is not printed twice.
 */
export function heroAndStrip(n: PackNumbers): { hero: EvidencedFigure | null; strip: EvidencedFigure[] } {
  const hero = n.headline[0] ?? n.costs[0] ?? null;
  const seen = new Set(hero === null ? [] : [hero.label]);
  const strip: EvidencedFigure[] = [];
  for (const f of [...n.headline.slice(1), ...n.returns, ...n.costs]) {
    if (seen.has(f.label)) continue;
    seen.add(f.label);
    strip.push(f);
  }
  return { hero, strip };
}

/**
 * THE COST STACK. The base is the purchase price, everything between stacks on
 * it, and the last figure closes the stack — which is what makes a waterfall
 * the right shape rather than a bar chart with a total bolted on.
 */
export function waterfallFrom(n: PackNumbers): WaterfallStep[] {
  const usable = n.costs.filter((f) => typeof f.amount === 'number');
  if (usable.length < 2) return [];
  return usable.map((f, i) => ({
    label: f.label,
    value: f.amount as number,
    display: f.value,
    kind: i === 0 ? 'base' : i === usable.length - 1 ? 'total' : 'add',
  }));
}

/**
 * NEARBY SOLD HOMES — THE SAME COMPARABLES THE ANALYSER USED (C1).
 *
 * ── WHAT THIS USED TO DO, AND WHY IT WAS WRONG ──────────────────────────────
 * It took the EIGHT HIGHEST-PRICED SALES IN THE WHOLE POSTCODE SECTOR. Not the
 * subject's type, not the last twelve months, not half a mile — and ranked so
 * that the dearest houses in the sector led the page. A pack is a document
 * somebody sends to an investor. Flattering the deal by choosing the evidence
 * is the single worst thing this product could do, and it was the default.
 *
 * ── WHAT IT DOES NOW ────────────────────────────────────────────────────────
 * It is handed the comparables the ONE engine produced for this property, on
 * the same three rules every other surface works to: the subject's own type,
 * sold within twelve months, within half a mile. They arrive sorted by
 * distance, so taking the first `limit` takes the NEAREST — never the dearest.
 *
 * Nothing is fetched from a portal and nothing is a live asking price.
 */
export function compsFrom(comps: readonly Comp[] | null, subjectPrice: number, limit = 8): CompRow[] {
  if (comps === null || comps.length === 0) return [];
  const rows: CompRow[] = comps
    .filter((c) => c.included)
    .slice(0, limit)
    .map((s) => ({
      address: [s.paon, s.street].filter((x) => x !== '').join(' ') || s.postcode,
      value: s.price,
      display: fmtMoney(s.price),
      note: s.type,
      subject: false,
    }));
  if (subjectPrice > 0) {
    rows.push({
      address: PACK_COPY.comps.subject,
      value: subjectPrice,
      display: fmtMoney(subjectPrice),
      note: '',
      subject: true,
    });
    // Re-ranked on the display figure, which is geometry for the list's own
    // order and not a second opinion about the deal: the SET was already
    // chosen, by distance, before anything got here.
    rows.sort((a, b) => b.value - a.value);
  }
  return rows;
}

export interface GrowthModel {
  history: GrowthPoint[];
  band: { low: number; high: number; years: number } | null;
  headline: string;
  note: string;
}

/**
 * PRICE GROWTH, with one scenario band.
 *
 * Withheld entirely below the transaction floor the area panel already uses:
 * under thirty registered sales in the trailing year an index is moved by a
 * handful of transactions, and a line drawn through it is noise dressed as a
 * trend. No chart is better than a soft one.
 */
export function growthFrom(
  trajectory: TrajectoryFile | null, codes: AreaCodesFile | null, sector: string, price: number | null,
): GrowthModel | null {
  if (trajectory === null || codes === null || sector === '') return null;
  const t = trajectoryFor(trajectory, codesForSector(codes, sector), price);
  if (t === null || t.scenarios === null) return null;
  const area = trajectory.areas[codesForSector(codes, sector).la ?? ''];
  if (area === undefined || area.v === null || area.v < MIN_TRANSACTIONS) return null;
  const g = growthOver(area.i, 10);
  if (g === null) return null;
  /**
    * TEN YEARS, because the headline says ten years. The index carries more
    * history than that, and a chart showing twenty while its own title claims
    * ten is a chart arguing with its caption.
    */
  const all = historyPoints(area.i);
  const history = all.slice(-11);
  if (history.length < 2) return null;
  const years = 5;
  return {
    history,
    band: bandEnds(area.i, t.scenarios.rates, years) === null
      ? null
      : { ...(bandEnds(area.i, t.scenarios.rates, years) as { low: number; high: number }), years },
    headline: PACK_COPY.growth.head(`${(g.annualised.value * 100).toFixed(1)}%`, area.n),
    note: `${PACK_COPY.growth.note} ${PACK_COPY.growth.source(PACK_COPY.area.ukhpi, trajectory.month)}`,
  };
}

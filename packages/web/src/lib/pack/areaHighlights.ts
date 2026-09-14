/**
 * DP1 — THE AREA HIGHLIGHTS, and why these four and not others.
 *
 * NO LINE GOES IN WITHOUT ITS SOURCE AND ITS DATE. That is rule 4 of the pack's
 * honesty contract, and it is why each highlight carries the dataset name and
 * the month it is from rather than a footnote at the back.
 *
 * WHAT IS DELIBERATELY NOT HERE:
 *  • Crime and deprivation. Both are in the app and both are honestly sourced,
 *    but there is no way to frame a deprivation decile "positively" in a
 *    document selling a deal without it becoming a nudge. Left out.
 *  • Anything on CLAUDE.md's permanent exclusions list — no EPC-C/MEES
 *    warnings, no per-council HMO links, no portal datasets, no live prices.
 *  • Schools and flood data, which this app does not hold.
 *
 * WHAT IS LEFT is four facts about the place, each from an official dataset,
 * each dated: what homes there sell for, how often they sell, what the local
 * authority's index has done over ten years, and how prices sit against
 * earnings. They are facts, not claims.
 */
import {
  MIN_TRANSACTIONS, codesForSector, fmtMoney, getAreaCodes, getAreaTrajectory,
  getManifest, getSector, growthOver, type TrajectoryFile, type SectorFile,
} from '@gil-bricks/core';
import { PACK_AREA } from '../../config/pack';
import type { AreaHighlight } from '../../components/pack/PackDocument';

/** "2026-06" as the month a person would say. */
const monthName = (m: string): string => {
  const [y, mm] = m.split('-');
  if (!y || !mm) return m;
  const d = new Date(Number(y), Number(mm) - 1, 1);
  return `${d.toLocaleDateString('en-GB', { month: 'long' })} ${y}`;
};

export interface HighlightSources {
  sector: SectorFile | null;
  trajectory: TrajectoryFile | null;
  /** The local authority code for this sector, from area-codes.json. */
  laCode: string | null;
  /** The month the sold-price data is as of. */
  ppdMonth: string;
}

/**
 * Build the highlights. Anything whose source or date is missing is simply not
 * produced — the pack would rather show three lines than four with one bare.
 */
export function areaHighlights(s: HighlightSources): AreaHighlight[] {
  const out: AreaHighlight[] = [];
  const ppd = PACK_AREA.sources.landRegistry;

  if (s.sector !== null && s.sector.stats.count > 0) {
    out.push({
      label: PACK_AREA.typicalPrice,
      value: fmtMoney(s.sector.stats.typicalPrice),
      sourceName: ppd,
      sourceAsOf: monthName(s.ppdMonth),
    });
    out.push({
      label: PACK_AREA.soldCount,
      value: PACK_AREA.soldCountValue(s.sector.stats.count),
      sourceName: ppd,
      sourceAsOf: monthName(s.ppdMonth),
    });
  }

  const la = s.laCode !== null && s.trajectory !== null ? s.trajectory.areas[s.laCode] : undefined;
  if (la !== undefined && s.trajectory !== null) {
    /**
     * THE SAME FLOOR AS THE AREA PANEL. Under thirty registered sales in the
     * trailing year, an index is moved by a handful of transactions and a
     * "trend" drawn through it is noise. No growth line rather than a soft one.
     */
    const enough = la.v !== null && la.v >= MIN_TRANSACTIONS;
    const g = enough ? growthOver(la.i, 10) : null;
    if (g !== null) {
      out.push({
        label: PACK_AREA.growth(la.n),
        value: PACK_AREA.growthValue(`${(g.annualised.value * 100).toFixed(1)}%`),
        sourceName: PACK_AREA.sources.ukhpi,
        sourceAsOf: monthName(s.trajectory.month),
      });
    }
    if (typeof la.a === 'number' && s.trajectory.affordability?.period) {
      out.push({
        label: PACK_AREA.affordability,
        value: PACK_AREA.affordabilityValue(la.a.toFixed(1)),
        sourceName: PACK_AREA.sources.ons,
        sourceAsOf: s.trajectory.affordability.period.slice(0, 4),
      });
    }
  }

  return out;
}

/**
 * Gather what the four lines need: the sector's own sold prices, the local
 * authority's index, and the month each is as of.
 *
 * FOUR FILES, AND A MISSING ONE IS NOT AN ERROR. A sector we hold no sales for
 * is a real, ordinary answer — the pack then prints fewer lines, never a line
 * with nothing behind it.
 */
export async function loadAreaFacts(sector: string): Promise<HighlightSources> {
  const [manifest, sectorFile, trajectory, codes] = await Promise.all([
    getManifest(),
    getSector(sector).catch(() => null),
    getAreaTrajectory().catch(() => null),
    getAreaCodes().catch(() => null),
  ]);
  return {
    sector: sectorFile,
    trajectory,
    laCode: codes === null ? null : codesForSector(codes, sector).la,
    ppdMonth: manifest.ppdMonth,
  };
}

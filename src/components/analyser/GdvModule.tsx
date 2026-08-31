/**
 * Profit-on-GDV — a LOOSELY-COUPLED module. Rendered only when the strategy
 * config sets flags.showGdvModule; removing the flag (or this file plus its
 * single call site in FlipVerdict) changes nothing else.
 */
import type { Breakdown } from '../../lib/maths/breakdown';
import { fmtPct } from '../../lib/maths/format';
import { MathsAccordion } from './Accordion';

export function GdvModule({ pct, breakdown }: { pct: number; breakdown: Breakdown }) {
  return (
    <div class="tile">
      <p class="tile-label">Profit on sale price</p>
      <p class="tile-value">{fmtPct(pct)}</p>
      <MathsAccordion breakdown={breakdown} />
    </div>
  );
}

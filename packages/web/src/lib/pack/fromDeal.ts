/**
 * DP1 — A SAVED DEAL BECOMES A PACK'S NUMBERS.
 *
 * ONE SOURCE OF INPUTS. This goes through `inputsFromParams` — the same
 * chokepoint the board re-scores through and the analyser fed — so the pack can
 * never quote a figure the analyser would disagree with. If the two ever drifted
 * an investor would be reading numbers the sourcer had never seen.
 *
 * AND THEN IT THROWS MOST OF IT AWAY. The analyses carry `verdict`,
 * `verdictCopy` and `lever`. This picks a short ALLOW-LIST out of each and
 * hands that to `packNumbers()`, which refuses any figure with no basis. The
 * Deal Score is never computed here at all.
 */
import {
  analyseBrrrr, analyseBtl, analyseFlip, analyseHmo,
  fmtMoney, fmtPct, packNumbers, perMonth, type PackNumbers, type PackSource,
} from '@gil-bricks/core';
import { inputsFromParams } from '../deals/scoreFromParams';
import { PACK_FIGURES } from '../../config/pack';

/** Wales pays Land Transaction Tax, and the label has to say which. */
const isWales = (inputs: Record<string, unknown>): boolean => inputs.country === 'W92000004';

const money = (n: number | null | undefined): string | null =>
  (typeof n === 'number' && Number.isFinite(n) ? fmtMoney(n) : null);
const pct = (n: number | null | undefined): string | null =>
  (typeof n === 'number' && Number.isFinite(n) ? fmtPct(n) : null);

/**
 * The money figures for a pack, from the deal's own saved parameters.
 *
 * Returns null when the parameters cannot produce a deal — a pack of dashes is
 * worse than no pack.
 */
export function packSourceFor(strategy: string, urlParams: string): PackSource | null {
  let inputs: Record<string, unknown> & { price: number };
  try {
    ({ inputs } = inputsFromParams(strategy, urlParams));
  } catch {
    return null;
  }
  if (!(inputs.price > 0)) return null;

  const wales = isWales(inputs);
  const refurb = Number(inputs.refurb ?? inputs.refurbCost ?? 0);
  const legals = Number(inputs.legals ?? 0);

  const base = {
    price: fmtMoney(inputs.price),
    inWales: wales,
    refurb: fmtMoney(Number.isFinite(refurb) ? refurb : 0),
    legals: fmtMoney(Number.isFinite(legals) ? legals : 0),
    additional: null as string | null,
  };

  try {
    if (strategy === 'btl') {
      const a = analyseBtl(inputs as never);
      return {
        ...base, strategy: 'btl',
        stampDuty: fmtMoney(a.stampDuty.value.tax),
        totalIn: fmtMoney(a.cashIn.value),
        monthlyRent: money(Number(inputs.monthlyRent)),
        returnPct: pct(a.roi.value), returnIsRoce: false,
        grossYield: pct(a.grossYield.value),
        endValue: null,
      };
    }
    if (strategy === 'hmo') {
      const a = analyseHmo(inputs as never);
      return {
        ...base, strategy: 'hmo',
        stampDuty: fmtMoney(a.stampDuty.value.tax),
        totalIn: fmtMoney(a.cashIn.value),
        // The ENGINE'S OWN income figure, not rooms × rent worked out again
        // here. Two places computing the same number is two places for it to
        // stop agreeing, and the pack must never disagree with the analyser.
        monthlyRent: money(a.grossIncome.value > 0 ? perMonth(a.grossIncome.value) : null),
        returnPct: pct(a.roi.value), returnIsRoce: false,
        grossYield: pct(a.grossYield.value),
        endValue: null,
      };
    }
    if (strategy === 'flip') {
      const a = analyseFlip(inputs as never);
      return {
        ...base, strategy: 'flip',
        stampDuty: fmtMoney(a.stampDuty.value.tax),
        totalIn: fmtMoney(a.cashInvested.value),
        monthlyRent: null,
        // A flip returns capital, not rent — so it is a return ON CAPITAL
        // EMPLOYED, and the label says so rather than borrowing "return on cash".
        returnPct: pct(a.profitOnGdvPct.value), returnIsRoce: true,
        grossYield: null,
        endValue: money(Number(inputs.gdv)),
      };
    }
    const a = analyseBrrrr(inputs as never);
    return {
      ...base, strategy: 'brrrr',
      stampDuty: fmtMoney(a.stampDuty.value.tax),
      totalIn: fmtMoney(a.cashInvested.value),
      monthlyRent: money(Number(inputs.monthlyRent)),
      // BRRRR's return is on what is LEFT IN after the refinance, which is the
      // whole point of the strategy. It can be null when nothing is left in —
      // an infinite return is not a number, and printing one would be a lie.
      returnPct: pct(a.roiOnLeftIn.value), returnIsRoce: true,
      grossYield: pct(a.grossYieldOnCost.value),
      endValue: money(Number(inputs.arv)),
    };
  } catch {
    return null;
  }
}

/** The pack's numbers, or null when the deal cannot produce them. */
export function packNumbersFor(strategy: string, urlParams: string): PackNumbers | null {
  const source = packSourceFor(strategy, urlParams);
  return source === null ? null : packNumbers(source, PACK_FIGURES);
}

/** Which refurb items were ticked, as their own labels — for the scope list. */
export function tickedScope(urlParams: string, items: readonly { key: string; label: string }[]): string[] {
  const p = new URLSearchParams(urlParams);
  return items
    .filter((i) => {
      const v = p.get(`rf${i.key.charAt(0).toUpperCase()}${i.key.slice(1)}`);
      return v !== null && v !== '' && v !== '0';
    })
    .map((i) => i.label);
}

/** The ticked keys, for the duration band. */
export function tickedKeys(urlParams: string, items: readonly { key: string }[]): string[] {
  const p = new URLSearchParams(urlParams);
  return items
    .filter((i) => {
      const v = p.get(`rf${i.key.charAt(0).toUpperCase()}${i.key.slice(1)}`);
      return v !== null && v !== '' && v !== '0';
    })
    .map((i) => i.key);
}

/**
 * Deal Score (E2): turns any analysed deal into one decision — a 0-10 score, a
 * good/marginal/walk-away verdict, a plain headline, and the single binding
 * constraint that held it back. It is a SCORING + EXPLANATION layer only: no
 * new financial formulas. Every number comes from the existing strategy
 * calculators; the binding constraint reuses their existing bisection levers.
 *
 * Consistency guarantee (asserted in tests): components are scored against the
 * SAME Green/Amber/Red thresholds the verdict uses, and weighted so a Green
 * verdict can never score below 6 and a Red can never reach 8.
 */
import { analyseBtl, type BtlAnalysis, type BtlInputs } from '../strategy-calc/btl';
import { analyseBrrrr, type BrrrrAnalysis, type BrrrrStrategyInputs } from '../strategy-calc/brrrr';
import { analyseFlip, type FlipAnalysis, type FlipStrategyInputs } from '../strategy-calc/flip';
import { analyseHmo, type HmoAnalysis, type HmoInputs } from '../strategy-calc/hmo';
import { strategyById } from '../strategies';
import type { ScoreComponent } from '../strategies/types';
import { fmtMoney, fmtPct } from '../maths/format';
import { scoreCopy, type Verdict } from './copy';

export type StrategyId = 'btl' | 'flip' | 'brrrr' | 'hmo';

/** Optional sold-price evidence to score the price/end-value component. */
export interface DealEvidence {
  /** Valuation midpoint estimate. */
  estimate: number;
  /** Top of the valuation range (over this = optimistic/overpaying). */
  high: number;
}

export interface ScoreComponentResult {
  name: string;
  points: number;
  max: number;
  /** green | amber | red | unknown */
  status: 'green' | 'amber' | 'red' | 'unknown';
  why: string;
}

export interface BindingConstraint {
  metric: string;
  currentValue: string;
  /** The lever target that would fix it, or null when no single lever can. */
  neededValue: string | null;
  plainExplanation: string;
}

export interface DealScore {
  score: number;
  /** Raw sum of the component points before the verdict-ceiling reconciliation
   * (the components always add up to this). Shown in the show-the-maths view. */
  rawScore: number;
  verdict: Verdict;
  headline: string;
  bindingConstraint: BindingConstraint | null;
  components: ScoreComponentResult[];
  /** The underlying strategy analysis (existing Green/Amber/Red + all figures). */
  analysis: BtlAnalysis | BrrrrAnalysis | FlipAnalysis | HmoAnalysis;
}

type Status = 'green' | 'amber' | 'red' | 'unknown';
const FRACTION: Record<Status, number> = { green: 1, amber: 0.5, red: 0, unknown: 0.5 };

/** Score a metric with a green/amber floor: green ≥ greenAt, amber ≥ 0, red < 0. */
function band(value: number, greenAt: number): Status {
  if (value >= greenAt) return 'green';
  if (value >= 0) return 'amber';
  return 'red';
}

/** Evidence: a figure that should not exceed the sold-price ceiling. */
function evidenceStatus(value: number, ev: DealEvidence | undefined): Status {
  if (!ev) return 'unknown';
  if (value <= ev.estimate) return 'green';
  if (value <= ev.high) return 'amber';
  return 'red';
}

interface ComponentEval {
  status: Status;
  why: string;
  /** For the binding constraint. */
  currentValue: string;
  neededValue: string | null;
}

/** Evaluate one component by key against the analysis (reuses existing figures/thresholds). */
function evaluate(
  key: string,
  a: DealScore['analysis'],
  inputs: AnyInputs,
  ev: DealEvidence | undefined,
): ComponentEval {
  switch (key) {
    case 'icr': {
      const icr = (a as BtlAnalysis).icr;
      return {
        status: icr.passes ? 'green' : 'red',
        why: icr.passes ? `Passes at ${icr.value.toFixed(2)}× (needs ${icr.threshold.toFixed(2)}×).` : `Only ${icr.value.toFixed(2)}× — the lender needs ${icr.threshold.toFixed(2)}×.`,
        currentValue: `${icr.value.toFixed(2)}×`,
        neededValue: `${icr.threshold.toFixed(2)}×`,
      };
    }
    case 'cashflow': {
      const cf = (a as BtlAnalysis).cashflowAfterTax.value;
      const min = (inputs.thresholds as { minCashflowGreen: number }).minCashflowGreen;
      return { status: band(cf, min), why: `${fmtMoney(cf)}/month after tax (green needs ${fmtMoney(min)}).`, currentValue: fmtMoney(cf), neededValue: `${fmtMoney(min)}/mo` };
    }
    case 'roi': {
      const t = inputs.thresholds as Record<string, number>;
      if ('greenRoi' in t) {
        const roi = (a as FlipAnalysis).roiAfterTax.value;
        const status: Status = roi >= t.greenRoi ? 'green' : roi >= t.amberRoi ? 'amber' : 'red';
        return { status, why: `${fmtPct(roi)} after tax (green needs ${fmtPct(t.greenRoi)}).`, currentValue: fmtPct(roi), neededValue: fmtPct(t.greenRoi) };
      }
      const roi = (a as BtlAnalysis).roi.value;
      return { status: band(roi, t.minRoiGreen), why: `${fmtPct(roi)} on cash in (green needs ${fmtPct(t.minRoiGreen)}).`, currentValue: fmtPct(roi), neededValue: fmtPct(t.minRoiGreen) };
    }
    case 'profit': {
      // Score against profit BEFORE tax — the same basis the legacy Flip verdict
      // gates Green on (colourOf uses c.profit). Scoring after-tax here would let
      // a legacy-GREEN flip fall below the profit threshold and read "walk away".
      const p = (a as FlipAnalysis).profitBeforeTax.value;
      const min = (inputs.thresholds as { greenProfit: number }).greenProfit;
      return { status: p <= 0 ? 'red' : p >= min ? 'green' : 'amber', why: `${fmtMoney(p)} profit (green needs ${fmtMoney(min)}).`, currentValue: fmtMoney(p), neededValue: fmtMoney(min) };
    }
    case 'moneyLeftIn': {
      const m = (a as BrrrrAnalysis).moneyLeftIn;
      const max = (inputs.thresholds as { allOutMax: number }).allOutMax;
      const mp = (a as BrrrrAnalysis).maxPriceAllOut;
      return { status: m <= max ? 'green' : m <= max + 15000 ? 'amber' : 'red', why: `${fmtMoney(m)} left in (all-money-out needs ≤ ${fmtMoney(max)}).`, currentValue: fmtMoney(m), neededValue: mp !== null ? `pay ≤ ${fmtMoney(mp)}` : null };
    }
    case 'roomSize': {
      const fails = (a as HmoAnalysis) && (inputs as HmoInputs).roomSizeFailures;
      return { status: fails === 0 ? 'green' : 'red', why: fails === 0 ? 'All rooms meet the legal minimum.' : `${fails} room(s) below the legal minimum size.`, currentValue: `${fails} room${fails === 1 ? '' : 's'} below the minimum`, neededValue: null };
    }
    case 'evidence': {
      // BTL scores purchase price; BRRRR/Flip score the end value they assume.
      const b = a as BrrrrAnalysis & FlipAnalysis;
      let value: number;
      let label: string;
      if ('arvNeededAllOut' in a) { value = (inputs as BrrrrStrategyInputs).arv; label = 'end value'; }
      else if ('gdvNeededGreen' in a) { value = (inputs as FlipStrategyInputs).gdv; label = 'sale price'; }
      else { value = (inputs as BtlInputs).price; label = 'price'; }
      const status = evidenceStatus(value, ev);
      const why = !ev ? 'No sold-price evidence loaded to check against.' : status === 'green' ? `Your ${label} ${fmtMoney(value)} sits at or below the sold evidence.` : status === 'amber' ? `Your ${label} ${fmtMoney(value)} is within the estimate range but toward the top.` : `Your ${label} ${fmtMoney(value)} is above what’s been selling nearby (${fmtMoney(ev.high)}).`;
      void b;
      return { status, why, currentValue: fmtMoney(value), neededValue: ev ? `≤ ${fmtMoney(ev.high)}` : null };
    }
    default:
      return { status: 'unknown', why: '', currentValue: '', neededValue: null };
  }
}

type AnyInputs = (BtlInputs | BrrrrStrategyInputs | FlipStrategyInputs | HmoInputs) & { thresholds: Record<string, number> };

function runAnalysis(strategy: StrategyId, inputs: AnyInputs): DealScore['analysis'] {
  switch (strategy) {
    case 'btl': return analyseBtl(inputs as BtlInputs);
    case 'brrrr': return analyseBrrrr(inputs as BrrrrStrategyInputs);
    case 'flip': return analyseFlip(inputs as FlipStrategyInputs);
    case 'hmo': return analyseHmo(inputs as HmoInputs);
  }
}

function verdictOf(score: number): Verdict {
  if (score >= 8) return 'good';
  if (score >= 6) return 'marginal';
  return 'walk away';
}

/**
 * Plain lever sentence for the binding component, reusing existing lever outputs.
 * ALL wording lives in copy.ts (fixByKey / leverByKey / noLeverByKey); this only
 * fills figures and picks the right template — the operator can reword freely.
 */
function leverFor(key: string, a: DealScore['analysis']): { needed: string | null; fixSentence: string } {
  const fix = scoreCopy.fixByKey as Record<string, string>;
  const lever = scoreCopy.leverByKey as Record<string, string>;
  const noLever = scoreCopy.noLeverByKey as Record<string, string>;
  // Non-financial gate: room size can't be fixed by a price/rent lever — say so.
  if (key === 'roomSize') {
    return { needed: null, fixSentence: fix.roomSize };
  }
  if (key === 'moneyLeftIn') {
    const mp = (a as BrrrrAnalysis).maxPriceAllOut;
    return mp !== null ? { needed: fmtMoney(mp), fixSentence: fix.moneyLeftIn.replace('{needed}', fmtMoney(mp)) } : { needed: null, fixSentence: noLever.moneyLeftIn };
  }
  if (key === 'evidence' && 'arvNeededAllOut' in a) {
    const arv = (a as BrrrrAnalysis).arvNeededAllOut;
    return arv !== null ? { needed: fmtMoney(arv), fixSentence: fix.evidence.replace('{needed}', fmtMoney(arv)) } : { needed: null, fixSentence: noLever.evidenceEndValue };
  }
  if (key === 'evidence' && 'gdvNeededGreen' in a) {
    const gdv = (a as FlipAnalysis).gdvNeededGreen;
    return gdv !== null ? { needed: fmtMoney(gdv), fixSentence: fix.evidence.replace('{needed}', fmtMoney(gdv)) } : { needed: null, fixSentence: noLever.evidenceEndValue };
  }
  if (key === 'profit' && 'maxOfferGreen' in a) {
    const mo = (a as FlipAnalysis).maxOfferGreen;
    return mo !== null ? { needed: fmtMoney(mo), fixSentence: lever.profit.replace('{needed}', fmtMoney(mo)) } : { needed: null, fixSentence: noLever.profit };
  }
  // Flip ROI: reuse the same max-offer solver rather than the (absent) greenLever.
  if (key === 'roi' && 'maxOfferGreen' in a) {
    const mo = (a as FlipAnalysis).maxOfferGreen;
    return mo !== null ? { needed: fmtMoney(mo), fixSentence: lever.roi.replace('{needed}', fmtMoney(mo)) } : { needed: null, fixSentence: noLever.roi };
  }
  // BTL/HMO price-vs-evidence: no single number to solve — point at the sold gap.
  if (key === 'evidence') {
    return { needed: null, fixSentence: noLever.evidence };
  }
  // BTL/HMO gates: use the surfaced green lever (price down / rent up)
  const gl = (a as BtlAnalysis).greenLever;
  if (gl && (gl.priceDown !== null || gl.rentUp !== null)) {
    const parts: string[] = [];
    if (gl.priceDown !== null) parts.push(lever.greenLeverPrice.replace('{needed}', fmtMoney(gl.priceDown)));
    if (gl.rentUp !== null) parts.push(lever.greenLeverRent.replace('{needed}', fmtMoney(gl.rentUp)));
    return { needed: parts.join(' or '), fixSentence: lever.greenLeverJoin.replace('{parts}', parts.join(' or ')) };
  }
  return { needed: null, fixSentence: noLever.default };
}

/** Capitalise the first letter so a fragment reads as its own sentence. */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * GOOD-deal headline — states what makes the deal good with its own numbers
 * (never praise). Templates live in copy.ts (goodByKey), editable.
 */
function goodHeadline(strategy: StrategyId, a: DealScore['analysis']): string {
  const G = scoreCopy.goodByKey as Record<string, string>;
  if (strategy === 'flip') {
    const f = a as FlipAnalysis;
    return G.flip.replace('{profit}', fmtMoney(f.profitBeforeTax.value)).replace('{roi}', fmtPct(f.roiAfterTax.value));
  }
  if (strategy === 'brrrr') {
    const b = a as BrrrrAnalysis;
    const cf = fmtMoney(b.cashflowAfterTax.value);
    // moneyLeftIn is floored at 0 (never negative); the real cash pulled out
    // ABOVE your input is `surplus`. Name it when there is one, else say it plainly.
    if (b.moneyLeftIn > 0) return G.brrrrIn.replace('{value}', fmtMoney(b.moneyLeftIn)).replace('{cashflow}', cf);
    return b.surplus > 0
      ? G.brrrrOut.replace('{value}', fmtMoney(b.surplus)).replace('{cashflow}', cf)
      : G.brrrrAllOut.replace('{cashflow}', cf);
  }
  const x = a as BtlAnalysis; // BTL and HMO share cashflowAfterTax + roi
  return (strategy === 'hmo' ? G.hmo : G.btl)
    .replace('{cashflow}', fmtMoney(x.cashflowAfterTax.value))
    .replace('{roi}', fmtPct(x.roi.value));
}

/**
 * DEAL-SPECIFIC headline built from the binding constraint's real figures.
 * Templates live in copy.ts (headlineByKey), editable. Always names >=1 figure.
 */
function dealHeadline(
  strategy: StrategyId,
  key: string,
  e: ComponentEval,
  a: DealScore['analysis'],
  t: Record<string, number>,
): string {
  const H = scoreCopy.headlineByKey as Record<string, string>;
  const v = e.currentValue;
  switch (key) {
    case 'icr':
      return H.icr.replace('{value}', v).replace('{needed}', `${(a as BtlAnalysis).icr.threshold.toFixed(2)}×`);
    case 'cashflow': {
      const cf = (a as BtlAnalysis).cashflowAfterTax.value;
      return cf < 0 ? H.cashflowNegative.replace('{value}', fmtMoney(Math.abs(cf))) : H.cashflow.replace('{value}', v);
    }
    case 'roi': {
      const roiVal = 'greenRoi' in t ? (a as FlipAnalysis).roiAfterTax.value : (a as BtlAnalysis).roi.value;
      if (roiVal < 0) return H.roiNegative.replace('{value}', v);
      const green = 'greenRoi' in t ? t.greenRoi : t.minRoiGreen;
      return H.roi.replace('{value}', v).replace('{needed}', fmtPct(green));
    }
    case 'moneyLeftIn': {
      const mp = (a as BrrrrAnalysis).maxPriceAllOut;
      return mp !== null ? H.moneyLeftIn.replace('{value}', v).replace('{needed}', fmtMoney(mp)) : H.moneyLeftInNoLever.replace('{value}', v);
    }
    case 'profit':
      return H.profit.replace('{value}', v).replace('{needed}', fmtMoney(t.greenProfit));
    case 'evidence': {
      const need = e.neededValue; // "≤ £high" or null
      return need ? H.evidence.replace('{value}', v).replace('{needed}', need.replace(/^≤\s*/, '')) : H.evidenceNoData.replace('{value}', v);
    }
    case 'roomSize':
      return H.roomSize.replace('{value}', v);
    default:
      return v;
  }
}

/**
 * Score a deal end-to-end. `evidence` (from the valuation engine) is optional;
 * without it the price/end-value component scores neutral and says so.
 */
export function scoreDeal(strategy: StrategyId, inputs: AnyInputs, evidence?: DealEvidence): DealScore {
  const config = strategyById(strategy);
  if (!config) throw new Error(`Unknown strategy: ${strategy}`);
  const analysis = runAnalysis(strategy, inputs);

  const components: ScoreComponentResult[] = config.score.map((c: ScoreComponent) => {
    const e = evaluate(c.key, analysis, inputs, evidence);
    return { name: c.name, max: c.weight, points: Math.round(c.weight * FRACTION[e.status] * 100) / 100, status: e.status, why: e.why };
  });

  const rawScore = Math.round(components.reduce((s, c) => s + c.points, 0) * 10) / 10;
  // Reconcile with the existing Green/Amber/Red verdict so the chip can NEVER
  // contradict the card in EITHER direction (the user-confusion CLAUDE.md
  // forbids). A sum-to-score model with a non-gate evidence component can't do
  // this structurally, so the displayed score is clamped into the card's own
  // band — green 8-10 (good), amber 6-7.9 (marginal), red 0-5.9 (walk away) —
  // which makes the chip's word, dot and headline always agree with the card.
  // rawScore (the honest component sum) is kept for show-the-maths; the number
  // still varies WITHIN the band, so it stays informative.
  const [floor, ceiling] = analysis.verdict === 'green' ? [8, 10] : analysis.verdict === 'amber' ? [6, 7.9] : [0, 5.9];
  const score = Math.min(Math.max(rawScore, floor), ceiling);
  const verdict = verdictOf(score);

  // Binding constraint = the component that lost the most points (largest gap),
  // preferring gates; ties break by config order (most fundamental first). Only
  // shown when the deal ISN'T already good — "what's holding it back" is
  // meaningless on a green/good deal (that spurious note contradicted the card).
  const gaps = config.score.map((c, i) => ({ c, i, lost: c.weight - components[i].points, comp: components[i] }));
  const worst = gaps.filter((g) => g.lost > 0).sort((a, b) => b.lost - a.lost || Number(b.c.gate) - Number(a.c.gate) || a.i - b.i)[0];
  const t = inputs.thresholds as Record<string, number>;
  let bindingConstraint: BindingConstraint | null = null;
  // The chip headline: deal-specific, carries THIS deal's deciding number. Good
  // deals name what makes them good; failing deals name the binding constraint.
  let headline: string;
  if (verdict === 'good' || !worst) {
    headline = verdict === 'good' ? goodHeadline(strategy, analysis) : scoreCopy.headline[verdict];
  } else {
    const e = evaluate(worst.c.key, analysis, inputs, evidence);
    const lever = leverFor(worst.c.key, analysis);
    // Self-contained explanation for the card note: the teaching sentence (names
    // the killing number) + the fix. Kept whole here so it reads grammatically.
    const teach = (scoreCopy.failureByKey as Record<string, string>)[worst.c.key];
    const failSentence = teach ? teach.replace('{value}', e.currentValue) : '';
    bindingConstraint = {
      metric: worst.c.name,
      currentValue: e.currentValue,
      neededValue: lever.needed ?? e.neededValue,
      plainExplanation: `${failSentence} ${cap(lever.fixSentence)}`.trim(),
    };
    headline = dealHeadline(strategy, worst.c.key, e, analysis, t);
  }

  return { score, rawScore, verdict, headline, bindingConstraint, components, analysis };
}

/**
 * 2-3 plain sentences teaching WHY a deal scored as it did, in Gil's voice,
 * naming the number that killed it. Copy is editable in score/copy.ts.
 */
export function explainFailure(result: DealScore): string {
  const { verdict, bindingConstraint: bc, components } = result;
  if (!bc) {
    return verdict === 'good'
      ? 'Nothing’s holding this back — the numbers stack up across the board.'
      : scoreCopy.headline[verdict];
  }
  // bc only exists when the verdict isn't good; plainExplanation already carries
  // the teaching sentence + the fix, so hand it back whole.
  return bc.plainExplanation;
}

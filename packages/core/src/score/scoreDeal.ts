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
import { ROOM_FIT_CAVEAT } from '../listing/floorplan';
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

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
/**
 * Continuous quality credit ∈ [0,1] for placing the score WITHIN the locked
 * verdict band (E8.3). Saturating and monotonic so a real change in the figure
 * always nudges the credit (never a flat step): a "higher-is-better" metric at
 * its green threshold reads 0.5 and rises asymptotically to 1; below zero it's 0.
 */
const upCredit = (value: number, greenAt: number): number => (value <= 0 ? 0 : greenAt > 0 ? value / (value + greenAt) : 1);
/** "lower-is-better" credit (money-left-in): 0 left → 1, at the target → 0.5. */
const downCredit = (value: number, targetAt: number): number => (targetAt > 0 ? targetAt / (targetAt + Math.max(value, 0)) : value <= 0 ? 1 : 0);

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
  /**
   * Continuous quality ∈ [0,1] for the smooth in-band score (E8.3). null when the
   * component can't be judged (unknown) — then it's excluded from the quality mix.
   */
  credit: number | null;
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
        credit: upCredit(icr.value, icr.threshold),
      };
    }
    case 'cashflow': {
      const cf = (a as BtlAnalysis).cashflowAfterTax.value;
      const min = (inputs.thresholds as { minCashflowGreen: number }).minCashflowGreen;
      return { status: band(cf, min), why: `${fmtMoney(cf)}/month after tax (green needs ${fmtMoney(min)}).`, currentValue: fmtMoney(cf), neededValue: `${fmtMoney(min)}/mo`, credit: upCredit(cf, min) };
    }
    case 'roi': {
      const t = inputs.thresholds as Record<string, number>;
      if ('greenRoi' in t) {
        const roi = (a as FlipAnalysis).roiAfterTax.value;
        const status: Status = roi >= t.greenRoi ? 'green' : roi >= t.amberRoi ? 'amber' : 'red';
        return { status, why: `${fmtPct(roi)} after tax (green needs ${fmtPct(t.greenRoi)}).`, currentValue: fmtPct(roi), neededValue: fmtPct(t.greenRoi), credit: upCredit(roi, t.greenRoi) };
      }
      const roi = (a as BtlAnalysis).roi.value;
      return { status: band(roi, t.minRoiGreen), why: `${fmtPct(roi)} on cash in (green needs ${fmtPct(t.minRoiGreen)}).`, currentValue: fmtPct(roi), neededValue: fmtPct(t.minRoiGreen), credit: upCredit(roi, t.minRoiGreen) };
    }
    case 'profit': {
      // Score against profit BEFORE tax — the same basis the legacy Flip verdict
      // gates Green on (colourOf uses c.profit). Scoring after-tax here would let
      // a legacy-GREEN flip fall below the profit threshold and read "walk away".
      const p = (a as FlipAnalysis).profitBeforeTax.value;
      const min = (inputs.thresholds as { greenProfit: number }).greenProfit;
      return { status: p <= 0 ? 'red' : p >= min ? 'green' : 'amber', why: `${fmtMoney(p)} profit (green needs ${fmtMoney(min)}).`, currentValue: fmtMoney(p), neededValue: fmtMoney(min), credit: upCredit(p, min) };
    }
    case 'moneyLeftIn': {
      const m = (a as BrrrrAnalysis).moneyLeftIn;
      const max = (inputs.thresholds as { allOutMax: number }).allOutMax;
      const mp = (a as BrrrrAnalysis).maxPriceAllOut;
      return { status: m <= max ? 'green' : m <= max + 15000 ? 'amber' : 'red', why: `${fmtMoney(m)} left in (all-money-out needs ≤ ${fmtMoney(max)}).`, currentValue: fmtMoney(m), neededValue: mp !== null ? `pay ≤ ${fmtMoney(mp)}` : null, credit: downCredit(m, max) };
    }
    case 'roomSize': {
      const fails = (inputs as HmoInputs).roomSizeFailures;
      const rooms = (inputs as HmoInputs).rooms;
      // null ⇒ the user hasn't measured rooms. We ASSUME lettable rooms from the
      // listing's bedroom count so the strategy can score, and say so plainly —
      // NEVER a legality claim that the rooms meet the statutory minimum (E9.1).
      if (fails == null) return {
        status: 'unknown',
        why: `Assumed ${rooms} lettable room${rooms === 1 ? '' : 's'} — check this figure. We can’t see room sizes from a listing, so measure them before you commit — undersized rooms can’t be let in a licensed HMO.`,
        currentValue: `${rooms} assumed rooms`,
        neededValue: null,
        credit: null,
      };
      // Measured by the user with the overlay — use THEIR figures, and say so.
      // The measured pass ALWAYS carries the caveat so it never reads as flat
      // legal compliance (E9.1 review).
      // Occupancy-AGNOSTIC wording: `fails` is judged against whichever statutory
      // minimum fits how each room is let (single 6.51 / two-adult 10.22 / child
      // 4.64 m² on the web; single-adult on the extension), so never assert one
      // specific figure here — it would be false for a double or child room (E9.1 review).
      return {
        status: fails === 0 ? 'green' : 'red',
        why: fails === 0
          ? `Your measured rooms all meet the statutory minimum size for how each is let. ${ROOM_FIT_CAVEAT}`
          : `From your measurements, ${fails} room(s) fall below the statutory minimum size for how they’re let. ${ROOM_FIT_CAVEAT}`,
        currentValue: `${fails} room${fails === 1 ? '' : 's'} below the minimum (measured)`,
        neededValue: null,
        credit: fails === 0 ? 1 : clamp01(1 - fails / 3),
      };
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
      // Lower value vs the sold estimate is better; excluded from the mix when
      // there's no evidence loaded (unknown).
      const credit = ev ? clamp01(ev.estimate / Math.max(value, 1)) : null;
      return { status, why, currentValue: fmtMoney(value), neededValue: ev ? `≤ ${fmtMoney(ev.high)}` : null, credit };
    }
    default:
      return { status: 'unknown', why: '', currentValue: '', neededValue: null, credit: null };
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
 * The Green/Amber/Red band a bare 0–10 score falls in — the SINGLE source shared
 * by every surface (the analyser chip, the extension, the pipeline board), so the
 * traffic-light colour is defined once. Same thresholds the verdict uses (green
 * 8–10, amber 6–7.9, red 0–5.9); a null/unscored deal has no band and no colour.
 */
export function verdictForScore(score: number): Verdict {
  return verdictOf(score);
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
  customKeys: ReadonlySet<string> = new Set(),
): string {
  const H = scoreCopy.headlineByKey as Record<string, string>;
  const C = scoreCopy.customByKey as Record<string, string>;
  // When the missed bar is one the USER set as a personal criterion, name it as
  // theirs ("… you set as your minimum.") — otherwise the generic template.
  const custom = customKeys.has(key);
  const v = e.currentValue;
  switch (key) {
    case 'icr':
      return (custom ? C.icr : H.icr).replace('{value}', v).replace('{needed}', `${(a as BtlAnalysis).icr.threshold.toFixed(2)}×`);
    case 'cashflow': {
      const cf = (a as BtlAnalysis).cashflowAfterTax.value;
      const min = fmtMoney((t as { minCashflowGreen?: number }).minCashflowGreen ?? 0);
      if (cf < 0) return (custom ? C.cashflowNegative : H.cashflowNegative).replace('{value}', fmtMoney(Math.abs(cf))).replace('{needed}', min);
      return (custom ? C.cashflow : H.cashflow).replace('{value}', v).replace('{needed}', min);
    }
    case 'roi': {
      const roiVal = 'greenRoi' in t ? (a as FlipAnalysis).roiAfterTax.value : (a as BtlAnalysis).roi.value;
      if (roiVal < 0) return (custom ? C.roiNegative : H.roiNegative).replace('{value}', v);
      const green = 'greenRoi' in t ? t.greenRoi : t.minRoiGreen;
      return (custom ? C.roi : H.roi).replace('{value}', v).replace('{needed}', fmtPct(green));
    }
    case 'moneyLeftIn': {
      const mp = (a as BrrrrAnalysis).maxPriceAllOut;
      return mp !== null ? H.moneyLeftIn.replace('{value}', v).replace('{needed}', fmtMoney(mp)) : H.moneyLeftInNoLever.replace('{value}', v);
    }
    case 'profit':
      return (custom ? C.profit : H.profit).replace('{value}', v).replace('{needed}', fmtMoney(t.greenProfit));
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
export function scoreDeal(strategy: StrategyId, inputs: AnyInputs, evidence?: DealEvidence, opts?: { customKeys?: ReadonlySet<string> }): DealScore {
  const config = strategyById(strategy);
  if (!config) throw new Error(`Unknown strategy: ${strategy}`);
  const analysis = runAnalysis(strategy, inputs);

  const evals = config.score.map((c: ScoreComponent) => ({ c, e: evaluate(c.key, analysis, inputs, evidence) }));
  const components: ScoreComponentResult[] = evals.map(({ c, e }) => ({
    name: c.name, max: c.weight, points: Math.round(c.weight * FRACTION[e.status] * 100) / 100, status: e.status, why: e.why,
  }));

  const rawScore = Math.round(components.reduce((s, c) => s + c.points, 0) * 10) / 10;
  // The TIER is the locked Green/Amber/Red verdict from the strategy engine —
  // green 8-10 (good), amber 6-7.9 (marginal), red 0-5.9 (walk away). We place
  // the displayed score CONTINUOUSLY inside that tier's own band from the
  // underlying figures (E8.3), so a real change in cashflow/ROI/money-left-in
  // visibly moves the number while the tier boundaries stay exactly as they are
  // and the chip can NEVER contradict the card. `q` ∈ [0,1] is the weighted
  // quality of the components that CAN be judged (unknowns excluded); it's
  // clamped so verdictOf(score) always equals the card's tier (asserted in tests).
  const [floor, ceiling] = analysis.verdict === 'green' ? [8, 10] : analysis.verdict === 'amber' ? [6, 7.9] : [0, 5.9];
  const scored = evals.filter(({ e }) => e.credit != null);
  const totalW = scored.reduce((s, { c }) => s + c.weight, 0);
  const q = totalW > 0 ? clamp01(scored.reduce((s, { c, e }) => s + c.weight * (e.credit as number), 0) / totalW) : 0.5;
  const score = Math.min(Math.max(Math.round((floor + q * (ceiling - floor)) * 10) / 10, floor), ceiling);
  const verdict = verdictOf(score);

  // Binding constraint = the component that lost the most points (largest gap),
  // preferring gates; ties break by config order (most fundamental first). Only
  // shown when the deal ISN'T already good — "what's holding it back" is
  // meaningless on a green/good deal (that spurious note contradicted the card).
  const gaps = config.score.map((c, i) => ({ c, i, lost: c.weight - components[i].points, comp: components[i] }));
  // "What's holding it back" must be a REAL, judged failure — never an UNKNOWN
  // component (one we can't judge, e.g. an unmeasured HMO room-size or missing
  // sold evidence). An unknown loses half its weight but asserting it as the
  // binding constraint would print a failure sentence ("you couldn't let every
  // room legally") for something we simply haven't verified — a false claim
  // (E9.1 review). So unknowns are excluded here.
  const worst = gaps.filter((g) => g.lost > 0 && g.comp.status !== 'unknown').sort((a, b) => b.lost - a.lost || Number(b.c.gate) - Number(a.c.gate) || a.i - b.i)[0];
  const t = inputs.thresholds as Record<string, number>;
  let bindingConstraint: BindingConstraint | null = null;
  // The chip headline: deal-specific, carries THIS deal's deciding number. Good
  // deals name what makes them good; failing deals name the binding constraint.
  let headline: string;
  if (verdict === 'good') {
    headline = goodHeadline(strategy, analysis);
  } else if (!worst) {
    // Non-good, yet no JUDGED component failed — an UNKNOWN one capped the tier.
    // The only real case is an unverified HMO room-size (money fine, rooms not
    // yet measured). Never a tier platitude and never a false failure: name the
    // unchecked thing with a real figure so the chip agrees with the verdict
    // banner beside it (E9.1 review). Any other (unreachable) case: tier line.
    const blocker = gaps.filter((g) => g.lost > 0 && g.comp.status === 'unknown')
      .sort((a, b) => b.lost - a.lost || Number(b.c.gate) - Number(a.c.gate) || a.i - b.i)[0];
    headline = blocker?.c.key === 'roomSize'
      ? scoreCopy.headlineByKey.roomSizeUnchecked.replace('{value}', `${(inputs as HmoInputs).rooms} rooms`)
      : scoreCopy.headline[verdict];
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
    headline = dealHeadline(strategy, worst.c.key, e, analysis, t, opts?.customKeys);
  }

  return { score, rawScore, verdict, headline, bindingConstraint, components, analysis };
}

/**
 * 2-3 plain sentences teaching WHY a deal scored as it did, in Gil's voice,
 * naming the number that killed it. Copy is editable in score/copy.ts.
 */
export function explainFailure(result: DealScore): string {
  const { verdict, bindingConstraint: bc } = result;
  if (!bc) {
    if (verdict === 'good') return 'Nothing’s holding this back — the numbers stack up across the board.';
    // Non-good with NO binding constraint ⇒ an unknown component capped the tier
    // (e.g. an unmeasured HMO room-size). Reuse the SAME honest, figure-bearing
    // headline the chip shows so the two never disagree — never a tier platitude
    // that would invent a failure the money doesn't have (E9.1 review).
    return result.headline;
  }
  // bc only exists when the verdict isn't good; plainExplanation already carries
  // the teaching sentence + the fix, so hand it back whole.
  return bc.plainExplanation;
}

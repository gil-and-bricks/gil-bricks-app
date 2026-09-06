/**
 * THE MOST YOU COULD PAY AND STILL BE HAPPY (P11).
 *
 * When a survey or a valuation lands, the only question worth asking is "what is
 * this worth to me NOW?". That is a reverse solve on price, and it is the same
 * search this library already does three times over (BTL and HMO's lever price,
 * BRRRR's all-out price): bisect the price against the SCORE that already
 * exists, and round the answer down to something you could actually offer.
 *
 * NO NEW MATHS LIVES HERE. Every judgement comes back from `scoreDeal`, which is
 * judged against the person's own thresholds — so "clears the criteria" means
 * exactly what it means everywhere else in the product.
 */
import { scoreDeal, verdictForScore, type DealEvidence, type StrategyId } from './scoreDeal';
import type { Verdict } from './copy';

/** Worst to best, so "at least as good as" is a comparison and not a special case. */
const RANK: Record<Verdict, number> = { 'walk away': 0, marginal: 1, good: 2 };

export interface MaxOfferOptions {
  /** Offers are made in round numbers; the answer is rounded DOWN to this. */
  step?: number;
  /** Never search below this price. */
  floor?: number;
}

/**
 * The highest price at which this deal still reaches `target`, or null when no
 * price does. Never rounds UP: an answer you could not offer is worse than none.
 *
 * `inputs` is exactly what `scoreDeal` takes — the caller builds it once, so the
 * price we solve for is scored the same way the deal itself is scored.
 */
export function maxOfferForVerdict(
  strategy: StrategyId,
  inputs: { price: number } & Record<string, unknown>,
  target: Verdict,
  evidence?: DealEvidence,
  opts: MaxOfferOptions = {},
): number | null {
  const step = opts.step ?? 250;
  const floor = opts.floor ?? 1000;
  const want = RANK[target];
  const clears = (price: number): boolean => {
    try {
      return RANK[verdictForScore(scoreDeal(strategy, { ...inputs, price } as never, evidence).score)] >= want;
    } catch {
      // A price the engine refuses to score is not a price you can offer.
      return false;
    }
  };
  const round = (n: number): number => Math.floor(n / step) * step;
  // Already there: the honest answer is THE PRICE ON THE TABLE, unrounded.
  // Rounding it down here invented a discount of up to one step on any price
  // that is not already on the grid — and £249,995 is what asking prices look
  // like (P11 review).
  if (clears(inputs.price)) return inputs.price;
  if (!clears(floor)) return null;
  let lo = floor;          // clears
  let hi = inputs.price;   // does not
  while (hi - lo > step / 2) {
    const mid = (lo + hi) / 2;
    if (clears(mid)) lo = mid;
    else hi = mid;
  }
  const answer = round(lo);
  return answer >= floor ? answer : null;
}

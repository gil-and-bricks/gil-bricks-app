/**
 * Suggestion sanity (E7.1). Remembered and derived values are only ever
 * SUGGESTIONS — never facts — so before we apply one to a property we sanity
 * check that it isn't absurd for THIS property. Three guards:
 *
 *  1. A remembered rent is per-sector, so it can be carried over from a far
 *     cheaper (or dearer) property. We only apply it when it implies a sane
 *     gross yield for the property in front of the user; otherwise we clear it
 *     and say why (see rentFitsProperty). Band lives in config.
 *  2. If the sold evidence can't judge the property (outside-evidence / thin),
 *     it can't support a suggested end value either — smartDefaults suppresses
 *     the suggestion (handled where the suggestion is built).
 *  3. When the sold evidence says a property is outside the local market AND no
 *     strategy can be made to work, we add one honest out-of-market line
 *     (see isOutOfMarket + microcopy).
 */
import type { Verdict } from '../score/copy';
import type { PriceVsSoldStatus } from './enrich';

/**
 * Does a remembered monthly rent imply a sane gross yield for THIS property?
 * Gross yield = annual rent / price. Outside [min,max] the remembered rent
 * plainly doesn't belong to this property (e.g. £344/mo on a £1.5m house is a
 * 0.3% yield — remembered from a far cheaper home), so we don't apply it.
 */
export function rentFitsProperty(
  monthlyRent: number,
  price: number,
  minYield: number,
  maxYield: number,
): boolean {
  if (!(monthlyRent > 0) || !(price > 0)) return false;
  const grossYield = (monthlyRent * 12) / price;
  return grossYield >= minYield && grossYield <= maxYield;
}

/**
 * True only when this is genuinely outside investment territory — the sold
 * evidence says the price sits outside the local market AND no strategy that
 * could be scored actually works (every scored verdict is 'walk away'). A
 * merely weak deal is always WITHIN the evidence, so it never trips this.
 * Strategies still waiting on an unknown contribute no verdict (null); with a
 * price this far above the local ceiling, the absence of a working strategy is
 * itself the signal — we never claim it while a scored strategy could work.
 */
export function isOutOfMarket(
  priceVsSoldStatus: PriceVsSoldStatus,
  verdicts: ReadonlyArray<Verdict | null>,
): boolean {
  if (priceVsSoldStatus !== 'outside-evidence') return false;
  return !verdicts.some((v) => v != null && v !== 'walk away');
}

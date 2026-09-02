/**
 * Deal Score copy in Gil's voice — direct, plain, no jargon, no guru talk.
 * EDITABLE HERE without touching engine code. `{value}` (the current figure)
 * and `{needed}` (the fix target) are filled in at render time.
 *
 * failureByKey: the "why it failed" teaching sentence for each binding
 * constraint. headlineByVerdict: the one-line verdict headline.
 */
export const scoreCopy = {
  headline: {
    good: 'A solid deal on these numbers — worth a closer look.',
    marginal: 'It works, but only just — the margins are thin.',
    'walk away': 'The numbers don’t stack up as they stand — walk away or renegotiate hard.',
  },
  /** Binding-constraint teaching copy, keyed by component. `{value}`=current, `{needed}`=fix target. */
  failureByKey: {
    icr: 'The rent doesn’t cover the mortgage by enough for a lender — their stress test comes out at {value}, under the level they need. Lenders won’t lend the amount you’re assuming.',
    cashflow: 'After the mortgage, costs and tax, this leaves {value} a month — too thin to be worth the risk. One void or repair and you’re topping it up from your own pocket.',
    roi: 'The return on the cash you’d tie up is only {value}. Your money would work harder almost anywhere else.',
    moneyLeftIn: 'After refinancing you’d still have {value} stuck in the deal. The whole point of BRRRR is getting your cash back out — this leaves too much behind.',
    profit: 'The profit here is {value} — once a sale slips or a cost overruns, that cushion disappears fast.',
    evidence: 'Your figure of {value} is ahead of what’s actually been selling nearby. If the market doesn’t agree, the deal doesn’t work.',
    roomSize: 'One or more rooms are below the legal minimum size for an HMO. As drawn, you couldn’t let every room — the income you’re counting on isn’t allowed.',
  },
  /** Second sentence: what would fix it (added when a lever exists). */
  fixByKey: {
    icr: 'A lower price or more rent would get you there.',
    cashflow: 'A lower price or higher rent is the only real fix.',
    roi: 'You’d need to pay less or earn more for the sums to justify the cash in.',
    moneyLeftIn: 'Pay no more than {needed} to pull all your cash back out.',
    profit: 'A lower purchase price is the cleanest way to widen the margin.',
    evidence: 'Aim for {needed} to line up with the sold evidence.',
    roomSize: 'Drop a room or choose a property with larger rooms.',
  },
} as const;

export type Verdict = 'good' | 'marginal' | 'walk away';

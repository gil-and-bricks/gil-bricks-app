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
  /**
   * DEAL-SPECIFIC headline for the verdict chip — the one line a beginner reads
   * first. It MUST carry this deal's own deciding number (never a tier platitude
   * shared across deals). Keyed by the binding constraint. `{value}` = the
   * killing figure on THIS deal, `{needed}` = the number that would fix it.
   */
  headlineByKey: {
    // "income" (not "rent") so it's accurate for HMO room income as well as BTL.
    icr: 'Income stress-tests at just {value} — lenders need {needed} before they’ll lend this much.',
    cashflow: 'Only {value} a month left after the mortgage, costs and tax — too thin to absorb a void.',
    cashflowNegative: 'You’d top up {value} a month — the rent doesn’t cover the costs.',
    roi: 'Just {value} back on the cash you’d tie up, short of the {needed} that makes the risk worth it.',
    roiNegative: 'You’d lose money on this — the return on the cash you’d tie up is {value}.',
    moneyLeftIn: '{value} would stay stuck after refinancing — pay {needed} or less to get it all back out.',
    moneyLeftInNoLever: '{value} would stay stuck after refinancing, and no purchase price gets it all back out.',
    profit: 'Only {value} profit before tax, under the {needed} cushion a flip needs for surprises.',
    evidence: 'Your {value} is above what’s actually sold nearby — the sold evidence tops out at {needed}.',
    // Fallback if it ever binds with no sold data loaded (its trigger); honest.
    evidenceNoData: 'Your {value} hasn’t been checked against sold evidence — none is loaded for this area yet.',
    roomSize: '{value} — you couldn’t let every room legally, so the room income you’re counting on isn’t there.',
    // The subject sits far outside the local sold evidence — not judged (bug E7/5b).
    evidenceOutside: 'No nearby sales at this level — we can’t judge the price from sold evidence.',
  },
  /**
   * Headline variants used when the bar being missed is one the USER set as a
   * personal criterion (E7) — names their own number. Keyed by component.
   */
  customByKey: {
    roi: 'Just {value} back on the cash you’d put in — short of the {needed} you set as your minimum.',
    roiNegative: 'You’d lose money on this — {value} back on your cash, below the return you set as your minimum.',
    cashflow: 'Only {value} a month after everything — under the {needed} cashflow you set as your minimum.',
    cashflowNegative: 'You’d top up {value} a month — below the {needed} cashflow you set as your minimum.',
    icr: 'Income stress-tests at just {value} — under the {needed} ICR you set as your minimum.',
    profit: 'Only {value} profit before tax — under the {needed} profit you set as your minimum.',
  },
  /**
   * GOOD-deal headline — states what makes it good with THIS deal's numbers,
   * never praise. Keyed by strategy (BRRRR has all-money-out-with-surplus,
   * all-money-out-exactly, and some-left-in variants). Slots are the relevant
   * figures for that strategy.
   */
  goodByKey: {
    btl: 'Cashflows {cashflow} a month after tax, with {roi} back on the cash you put in.',
    hmo: 'Cashflows {cashflow} a month after tax, with {roi} back on the cash you put in.',
    flip: '{profit} profit before tax, with {roi} back on the cash you put in.',
    brrrrOut: 'All your cash back out plus {value}, and it still cashflows {cashflow} a month.',
    brrrrAllOut: 'All your cash back out, and it still cashflows {cashflow} a month.',
    brrrrIn: 'Only {value} left in after refinancing, and it still cashflows {cashflow} a month.',
  },
  /**
   * Lever "fix" sentences for the card note — filled with figures by the engine,
   * fully editable here. `{needed}` = the solved fix number, `{parts}` = the
   * joined price/rent lever for BTL/HMO. noLeverByKey = the honest "no single
   * fix exists" line when the solver returns nothing.
   */
  leverByKey: {
    profit: 'Pay no more than {needed} to hit the profit you need.',
    roi: 'Pay no more than {needed} to lift the return.',
    greenLeverPrice: 'a {needed} lower price',
    greenLeverRent: '{needed} more rent',
    greenLeverJoin: '{parts} would turn this Green.',
  },
  /**
   * Suggestion-sanity + triage notes (E7.1). Shown in the panel verbatim
   * (no placeholder interpolation); fully editable here.
   */
  listingNotes: {
    // A remembered (per-sector) rent that doesn't fit THIS property — cleared, not applied.
    rememberedRentUnfit: 'The rent we remembered here doesn’t fit this property, so we’ve cleared it — enter one that matches.',
    // Priced above local investment stock AND works on no strategy. Doesn't assert
    // a property type we haven't checked (E7.1 review) — only what the numbers show.
    outOfMarket: 'This is priced well above local investment stock — the numbers won’t work on any strategy.',
  },
  /**
   * Auction warning (E8.1) — shown PROMINENTLY above the components whenever the
   * listing is an auction. Plain English; fully editable here.
   */
  auction: {
    heading: 'This is an auction listing — read this first',
    guide: 'The guide price is a starting point, not what it will sell for — and it is not a valuation.',
    fees: 'Auction fees and a buyer’s premium usually apply on top of the price — check the exact figures in the auction particulars.',
    legal: 'Have a solicitor review the legal pack BEFORE you bid — it can carry costs and conditions that change the deal.',
  },
  /** "What you need to put in" costs card (E8.1) — line labels + the show-the-maths intro. */
  cashNeeded: {
    heading: 'What you need to put in',
    intro: 'The cash you’d need up front to do this deal:',
    auctionFeesNote: 'estimate — check the exact fees in the auction particulars',
    bridgingSplit: 'Of the purchase, {borrowed} is bridged and {cash} is your cash.',
  },
  noLeverByKey: {
    moneyLeftIn: 'On these numbers no purchase price pulls all your cash back out.',
    profit: 'On these numbers no purchase price reaches the target profit.',
    roi: 'On these numbers no purchase price reaches the return you need.',
    evidence: 'A lower price — closer to what’s actually sold nearby — is the fix.',
    evidenceEndValue: 'A more realistic end value — closer to what’s actually sold nearby — is the fix.',
    default: 'On these numbers there’s no single lever that fixes this — the shape of the deal has to change.',
  },
} as const;

export type Verdict = 'good' | 'marginal' | 'walk away';

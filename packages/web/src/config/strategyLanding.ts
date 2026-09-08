/**
 * The four strategy landing pages — /buy-to-let, /flip, /brrrr, /hmo (A1).
 *
 * THESE ARE SEO LANDING PAGES. That is the decision (2026-09-07): nothing
 * inside the product links to them, and it should not — the nav and the
 * homepage send people straight to the analyser. They exist for one reader:
 * somebody who has never heard of this site and has just clicked a search
 * result for "BRRRR calculator UK". So the page has to say what the strategy
 * is, what the tool will tell them, what they need in hand, and then get out
 * of the way.
 *
 * Everything specific to a strategy — its name, its one-liner, what the engine
 * checks, what it must be told — already lives in the StrategyConfig objects in
 * @gil-bricks/core. This file holds only the words the four pages share.
 */
export const STRATEGY_LANDING = {
  /** The one action the page exists to produce. */
  cta: 'Open the analyser',

  /** The words a search result needs. The h1 is the strategy's name plus this;
   *  the title adds where it works, because "England & Wales only" is the first
   *  thing a stranger needs to know and the last thing they should find out. */
  h1Suffix: 'deal analyser',
  titleSuffix: 'free England & Wales deal analyser',

  /** What the answer will actually contain. Reads config.score — no new nouns. */
  checks: {
    heading: 'What it looks at',
    /** Said under the list. The weakest JUDGED check is the binding constraint
     *  the engine names — it is not the same as the verdict band, so this says
     *  "holds it back", which is what the engine actually reports. */
    note: 'The weakest of these is what holds the deal back.',
  },

  /** What a stranger needs in hand before starting. */
  need: {
    heading: 'What you need',
    /** True for every strategy: the three inputs the analyser cannot start without. */
    always: 'The postcode, the asking price and the type of property.',
    /** Then the strategy's own required unknowns, e.g. "Plus the monthly rent." */
    plus: 'Plus the',
    and: 'and the',
    /** A strategy that needs something the engine cannot infer from a listing.
     *  HMO room sizes are the only one: without them the room-size check stays
     *  unjudged, and the page must not imply otherwise. */
    also: { hmo: 'Room sizes too, once you have measured them.' } as Record<string, string>,
  },

  /** The three cards. Card three used to link to an anchor that does not exist
   *  until the analyser has been filled in — it now says what it needs first. */
  cards: {
    analyser: 'Deal analyser',
    comps: 'Sold comparables',
    compsBody: 'The standard sales near a postcode, with honest £/m² evidence.',
  },

  /** Said under the two cards, so the valuation is still promised without a
   *  third card pointing at the same page as the first (A1 review). */
  valuationNote: 'The analyser also values the property from the sold evidence, as a range.',

  /** The other three strategies, at the foot of the page. */
  also: 'Also:',
  separator: ' · ',

  /** The trust line: why these numbers are worth anything. */
  trust: 'Free, no sign-up. Sold prices come from HM Land Registry.',
} as const;

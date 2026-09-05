/**
 * Every word the four verdict islands print (BtlVerdict, BrrrrVerdict,
 * FlipVerdict, HmoVerdict). The verdict sentence, the lever and the Deal Score
 * line come from @gil-bricks/core; what lives here is the wording AROUND them —
 * the card heading, the figure-tile labels, the cross-check against sold
 * evidence, and the accordion bodies.
 *
 * Reword anything here and the pages change: no component edit, no migration.
 * A line that carries a figure is a FUNCTION — the already-formatted number is
 * passed in, so words move without a number ever being worked out here.
 *
 * TWO THINGS ARE DELIBERATELY LONG. Verdict headlines, levers and Deal Score
 * lines are exempt from the shortening rules (CLAUDE.md copy rule 7): naming
 * the binding number IS the plain-English win. And the HMO accordion bodies
 * quote statutory room sizes and the planning classes — every digit, unit and
 * class name is quoted precisely. Do not trim either.
 */

/** Said the same way on all four verdicts: the heading, the units, the stress test. */
export const VERDICT_COPY = {
  /** The card heading. The strategy name comes from its StrategyConfig. */
  heading: (strategyName: string): string => `${strategyName} verdict`,
  /** Unit suffixes, stuck on the end of an already-formatted figure. */
  perMonth: '/mo',
  perYear: '/yr',
  /** The stress-test tile. The label carries the ICR the test was run at. */
  icrLabel: (icrPct: number): string => `Rent-covers-mortgage test (ICR ${icrPct}%)`,
  icrResult: (ratio: string, outcome: string): string => `${ratio} — ${outcome}`,
  icrPasses: 'passes',
  icrFails: 'fails',
  /** Shown where a solved-for figure has no answer at any price. */
  notReachable: 'Not reachable',
} as const;

/** The buy-to-let verdict (BtlVerdict.tsx). */
export const BTL_COPY = {
  /** The tax named in the cash-in tile and its band lines. */
  taxNames: { england: 'Stamp Duty', wales: 'Land Transaction Tax' },
  /** Under the banner: the asking price against our sold-evidence estimate. */
  crosscheck: (asking: string, estimate: string, low: string, high: string): string =>
    `Asking ${asking} vs our estimate ${estimate} (${low}–${high}).`,
  /** Joined onto the end of that sentence — the leading space is the join. */
  crosscheckExpensive: ' Looks expensive vs sold evidence.',
  crosscheckCheap: ' Below sold evidence — check why.',
  /** The figure tiles, in the order they appear. */
  tiles: {
    roi: 'ROI',
    grossYield: 'Gross yield',
    netYield: 'Net yield',
    cashflowAfterTax: 'Cashflow after tax',
    cashIn: (taxName: string): string => `Cash in (incl. ${taxName})`,
    taxPerYear: 'Tax on rental profit',
    cashflowBeforeTax: 'Cashflow before tax',
  },
  /** Inside the cash-in tile: the tax bill, then one line per band. */
  taxTotal: (taxName: string, tax: string): string => `${taxName}: ${tax}`,
  taxBand: (rate: string, slice: string, tax: string): string => `${rate} on ${slice} = ${tax}`,
  /** The figures handed to Save and to the pipeline board. */
  savedHeadline: (roi: string): string => `ROI ${roi}`,
  boardFigure: (cashflow: string): string => `${cashflow}${VERDICT_COPY.perMonth}`,
} as const;

/** The BRRRR verdict (BrrrrVerdict.tsx). */
export const BRRRR_COPY = {
  /** Under the banner: the user's end value against our sold-evidence estimate. */
  crosscheck: (endValue: string, estimate: string, low: string, high: string): string =>
    `Your end value ${endValue} vs our estimate ${estimate} (${low}–${high}).`,
  /** Joined onto the end of that sentence — the leading space is the join. */
  crosscheckAmbitious: ' Ambitious — get a broker’s opinion before relying on it.',
  /** The hero tile. Its value is the outcome sentence from @gil-bricks/core. */
  outcomeLabel: 'The outcome',
  /** The figure tiles, in the order they appear. */
  tiles: {
    maxPriceAllOut: 'Max price for all money out',
    arvNeededAllOut: 'End value needed for all money out',
    refiLoan: 'Refinance loan',
    cashInvested: 'Cash invested',
    bridging: 'Bridging cost',
    cashflowAfterTax: 'Cashflow after tax',
    roiOnLeftIn: 'Return on money left in',
    grossYieldOnCost: 'Gross yield on total cost',
  },
  /** Shown instead of a return when there is no money left in to return on. */
  infiniteReturn: 'Effectively infinite',
  /** The show-the-maths panel of the max-price tile — solved, so hand-written. */
  maxPriceMaths: {
    label: 'Max price for all money out',
    formula: 'the highest price at which money left in is £0, solved against the same maths',
    substituted: (endValue: string, ltv: string): string => `end value ${endValue}, ${ltv} LTV, your fees and refurb`,
    unreachable: 'no price achieves it',
    note: 'your ceiling for offers if pulling everything out matters',
  },
  /** The same, for the end-value-needed tile. */
  arvNeededMaths: {
    label: 'End value needed',
    formula: 'the smallest end value at which money left in is £0',
    substituted: (price: string, ltv: string): string => `price ${price}, ${ltv} LTV, your fees and refurb`,
    unreachable: 'no end value achieves it',
    note: 'compare it with our estimate before believing it',
  },
} as const;

/** The flip verdict (FlipVerdict.tsx). No rental words anywhere. */
export const FLIP_COPY = {
  /** Under the banner: the user's sale price against our sold-evidence estimate. */
  crosscheck: (salePrice: string, estimate: string, low: string, high: string): string =>
    `Your sale price ${salePrice} vs our estimate ${estimate} (${low}–${high}).`,
  /** Joined onto the end of that sentence — the leading space is the join. */
  crosscheckAmbitious: ' Ambitious — get a broker’s opinion before relying on it.',
  /** The hero tile names which tax scenario the figure is for. */
  heroLabel: (scenario: string): string => `Project return after tax (${scenario})`,
  scenarioCompany: 'company',
  scenarioPersonal: 'personal',
  /** The quieter second figure under the hero. */
  beforeTax: (roi: string): string => `before tax: ${roi}`,
  /** The figure tiles, in the order they appear. */
  tiles: {
    profitBeforeTax: 'Profit before tax',
    taxOnProfit: 'Tax on the profit',
    personally: 'Personally',
    company: 'Company',
    profitAfterTax: 'Profit after tax',
    totalCostIn: 'Total cost in',
    cashInvested: 'Cash invested',
    financeCosts: 'Finance costs',
    maxOfferGreen: 'Max offer for a Green flip',
    gdvNeededGreen: 'Sale price needed for Green',
  },
  /** Under the company column of the tax comparison. */
  companyDrawdown: 'Taking the money out of the company personally is taxed again.',
  /** The show-the-maths panel of the max-offer tile — solved, so hand-written. */
  maxOfferMaths: {
    label: 'Max offer for Green',
    formula: 'the highest price that keeps the flip Green, solved against the same maths',
    substituted: (salePrice: string): string => `sale price ${salePrice}, your costs and tax scenario`,
    unreachable: 'no price achieves it',
    note: 'your negotiating ceiling if the margin matters',
  },
  /** The same, for the sale-price-needed tile. */
  gdvNeededMaths: {
    label: 'Sale price needed for Green',
    formula: 'the smallest sale price that makes the flip Green',
    substituted: (price: string): string => `price ${price}, your costs and tax scenario`,
    unreachable: 'no sale price achieves it',
    note: 'only believe it if the sold evidence does',
  },
  /** The figures handed to Save and to the pipeline board. */
  savedHeadline: (profit: string): string => `${profit} profit after tax`,
  boardFigure: (profit: string): string => `${profit} profit`,
} as const;

/** The small-HMO verdict (HmoVerdict.tsx). Bricks-and-mortar valuation only. */
export const HMO_COPY = {
  /** The optional room-size checker, in an accordion above the answer. */
  roomSizes: {
    heading: 'Check your room sizes are legal',
    /** The statutory minimums, quoted precisely. Never round these figures. */
    body: 'Statutory minimums for licensed HMOs in England: 6.51 sqm for one adult, 10.22 sqm for two, 4.64 sqm for a child under 10 — under 4.64 sqm cannot be a bedroom at all. Councils can require larger — always check locally.',
    /** One row per room: its size, then who sleeps in it. */
    roomLabel: (roomNumber: number): string => `Room ${roomNumber} (sqm)`,
    occupancyLabel: 'Sleeps',
    occupancy: { single: 'One adult', double: 'Two adults', child: 'Child under 10' },
    /** The verdict on one room. The failure reason comes from @gil-bricks/core. */
    pass: '✓ legal',
    fail: (message: string): string => `✗ ${message}`,
  },
  /** Under the banner: the purchase price against our bricks-and-mortar estimate. */
  crosscheck: (purchase: string, estimate: string, low: string, high: string): string =>
    `Purchase ${purchase} vs bricks-and-mortar estimate ${estimate} (${low}–${high}).`,
  /** Joined onto the end of that sentence — the leading space is the join. */
  crosscheckExpensive: ' Looks expensive vs sold evidence.',
  /** The planning accordion. Classes, people counts and the Article 4 rule are
   *  quoted precisely — this is what a council will hold someone to. */
  planning: {
    heading: 'Planning: do I need permission?',
    body: 'Turning an ordinary house (class C3) into a small HMO (class C4, 3–6 people) is usually ‘permitted development’ — no planning application. But where the council has made an Article 4 direction, full planning permission is needed. 7 or more people is always ‘sui generis’ and needs permission everywhere.',
  },
  /** The figure tiles, in the order they appear. */
  tiles: {
    roi: 'Return on investment',
    cashflowAfterTax: 'Cashflow after tax',
    grossIncome: 'Gross room income',
    operatingCosts: 'Operating costs',
    noi: 'Net operating income',
    grossYield: 'Gross yield',
    netYield: 'Net yield',
    cashIn: 'Cash in',
    taxPerYear: 'Tax on the rooms',
  },
  /** The figure handed to Save and to the pipeline board. */
  savedHeadline: (roi: string): string => `ROI ${roi}`,
} as const;

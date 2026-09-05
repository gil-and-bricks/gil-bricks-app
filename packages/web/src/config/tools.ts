/**
 * The tools registry and every word around it (T1). Adding a tool is ONE entry
 * here plus a page at src/pages/tools/<slug>.astro — nothing else changes.
 *
 * THE LAW OF THIS SECTION: the answer is never gated. No email wall, no signup
 * to see a result. Saving is offered AFTER the answer, optional, with the
 * Google sign-in that already exists. A tool that hides its answer is a bait
 * page, and this product does not ship those.
 *
 * Tools are standalone: they may import pure leaf maths from @gil-bricks/core
 * (so formulas and tax bands can never drift) and nothing else from the app.
 */
export interface ToolEntry {
  /** URL slug under /tools. */
  slug: string;
  /** The page's H1 and the card's title. */
  title: string;
  /** One line, on the index card and in the meta description. */
  description: string;
  /** Off = the card is hidden from the index. The page, if any, still exists. */
  enabled: boolean;
}

export const TOOLS: readonly ToolEntry[] = [
  {
    slug: 'equity',
    title: 'How much equity do I have?',
    description: 'Estimate what your home is worth now and how much of it is yours.',
    enabled: true,
  },
];

/** Copy shared by the index and every tool page. */
export const TOOLS_COPY = {
  indexTitle: 'Tools',
  indexTagline: 'Small calculators. One question each, answered in seconds.',
  /** Shown when every tool is switched off. */
  empty: 'No tools are switched on right now.',
  /** The expander every tool uses to show its working. */
  howHeading: 'How this works',
  /** The three lines of the maths panel. */
  maths: { formula: 'Formula', numbers: 'Your numbers', result: 'Result' },
  /** The quiet footer that introduces the product to a first-time visitor. */
  footer: {
    lead: (siteName: string): string => `${siteName} checks UK property deals against real sold prices. Free.`,
    analyser: 'Try the deal analyser',
    extension: 'Get the Chrome side panel',
  },
  /** Said on every tool page, near the answer. */
  disclaimer: 'An estimate from public data. It is not a valuation and no lender will accept it.',
} as const;

/** The equity calculator. */
export const EQUITY = {
  slug: 'equity',
  h1: 'How much equity do I have?',
  intro: 'Three answers you already know, and we do the rest.',
  form: {
    paid: 'What you paid',
    month: 'When you bought',
    owed: 'What you still owe',
    region: 'Where the property is',
    regions: [
      { value: 'E92000001', label: 'England' },
      { value: 'W92000004', label: 'Wales' },
    ],
    submit: 'Work out my equity',
    /** The month and year pickers, labelled separately for screen readers. */
    monthPart: 'Month',
    yearPart: 'Year',
    choose: 'Choose',
    monthNames: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ],
    /** Says WHY the last month or two are missing, instead of leaving a gap. */
    monthHint: (latest: string): string => `The index runs to ${latest}. It lags a couple of months.`,
    owedHint: 'Zero if it is paid off.',
  },
  errors: {
    paid: 'Enter what you paid for it.',
    month: 'Pick the month and year you bought.',
    owed: 'Enter what you still owe, or 0.',
    dataDown: 'The house price data did not load. Try again in a moment.',
  },
  /** The answer, in the operator's voice. Numbers are already formatted. */
  answer: (value: string, owed: string, equity: string, pct: string): string =>
    `Your home is worth roughly ${value} today. Take off the ${owed} you owe and ${equity} is yours — ${pct} of it.`,
  /** Said when the loan is bigger than the estimate. Honest, not alarming. */
  negative: (short: string): string =>
    `The estimate is ${short} below what you still owe. Prices in the index have not kept up with the loan.`,
  outright: (value: string): string => `Nothing owing, so all of it is yours: roughly ${value}.`,
  /** The three figures, labelled, in every case. */
  figures: { value: 'Estimated value', equity: 'Your equity', ltv: 'Loan to value', noLoan: 'No loan' },
  /** The limits, said plainly, right by the answer — never below the fold. */
  limits: [
    'This is the house price index applied to what you paid.',
    'It knows nothing about your property: condition, extensions or the street.',
    'It is not a valuation and no lender will accept it.',
  ],
  asOf: (month: string, country: string): string => `${country} house price index, to ${month}.`,
  /** The onward path — help, not promotion. */
  onward: {
    line: 'Thinking of using some of that equity to invest? The analyser tells you whether a specific property stacks up.',
    cta: 'Open the deal analyser',
  },
  /** Offered AFTER the answer. Skip it and nothing is ever sent to us. */
  save: {
    heading: 'Keep this?',
    body: 'One tap with Google stores this estimate on your account.',
    /** Honest, because nothing lists saved answers back to you yet. */
    note: 'There is no page for saved answers yet.',
    signedIn: 'Save this estimate',
    saving: 'Saving…',
    saved: 'Stored on your account.',
    failed: 'That did not save. Your answer is still on screen.',
  },
  howBody: 'We move what you paid by the official house price index, from your month to the latest published. Then we take off what you owe.',
} as const;

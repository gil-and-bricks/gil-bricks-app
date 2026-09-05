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
    slug: 'stamp-duty',
    title: 'What stamp duty will I pay?',
    description: 'Stamp duty or Welsh LTT on a purchase, with every band shown.',
    enabled: true,
  },
  {
    slug: 'rental-yield',
    title: 'What yield does this give me?',
    description: 'Gross and net yield on a rental, with the costs that make the difference.',
    enabled: true,
  },
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
  /** Heading over the links to the other tools. */
  othersHeading: 'Other tools',
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
  /** Said on EVERY tool page, so it stays true of all of them. What each tool
   *  cannot do is said inside its own answer, in its own words. */
  disclaimer: 'These are estimates, not advice. Check anything that matters with a professional.',
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
  howBody: 'We move what you paid by the official house price index, from your month to the latest published. Then we take off what you owe.',
} as const;

/**
 * The stamp duty / LTT calculator (T2). Every rate comes from rates.json via
 * @gil-bricks/core, so this file holds words only — never a rate, never a
 * threshold, never a band.
 */
export const STAMP = {
  slug: 'stamp-duty',
  h1: 'What stamp duty will I pay?',
  intro: 'Three answers and the tax is worked out.',
  form: {
    price: 'What you are paying',
    country: 'Where the property is',
    countries: [
      { value: 'E92000001', label: 'England or Northern Ireland' },
      { value: 'W92000004', label: 'Wales' },
    ],
    buyer: 'What this purchase is',
    buyers: [
      { value: 'firstTimeBuyer', label: 'My first home' },
      { value: 'standard', label: 'Moving home' },
      { value: 'additional', label: 'An additional property' },
    ],
    // This stops the commonest wrong entry: someone buying their next home
    // before the old one sells pays the additional rates and reclaims later.
    buyerHint: 'An additional property is a buy-to-let or a second home. It also counts if you have not sold your old home yet.',
    submit: 'Work out my stamp duty',
  },
  errors: { price: 'Enter what you are paying.' },
  /** The answer, naming the number and the effective rate. */
  answer: (tax: string, rate: string, taxName: string): string =>
    `You pay ${tax} in ${taxName} — ${rate} of the price.`,
  /** When the whole price sits in the 0% band. */
  none: (taxName: string): string => `No ${taxName} to pay on this price.`,
  taxNames: { E92000001: 'stamp duty', W92000004: 'land transaction tax' },
  figures: { tax: 'Tax to pay', rate: 'Effective rate', regime: 'Rates applied' },
  /** Said once, plainly, next to the answer. */
  limits: [
    'Homes only: not mixed use, not companies, not ATED.',
    'It does not cover Scotland or the extra rate for non-UK residents.',
    'It is a calculator, not tax advice.',
  ],
  /** The line that stops this being a stale calculator. */
  asOf: (from: string): string => `Rates effective from ${from}.`,
  source: (url: string): string => `Rates from ${url}`,
  /** The maths table headings. */
  table: { band: 'Band', slice: 'Taxed in it', rate: 'Rate', tax: 'Tax', running: 'Running total', total: 'Total' },
  bandLabel: (from: string, to: string | null): string => (to === null ? `Above ${from}` : `${from} to ${to}`),
  onward: {
    line: 'Buying to let? The analyser puts this tax into the deal and tells you if it still works.',
    cta: 'Open the deal analyser',
  },
  howBody: 'Each slice of the price is taxed at its own band rate. We add the slices up, straight from the published bands.',
} as const;

/**
 * The rental yield calculator (T2). Net is the number that matters, and the
 * costs behind it are the user's to set — we never claim to know them.
 */
export const YIELD = {
  slug: 'rental-yield',
  h1: 'What yield does this give me?',
  intro: 'Two numbers to start. The costs below are yours to change.',
  form: {
    price: 'What you are paying',
    rent: 'Monthly rent',
    costsHeading: 'Running costs',
    costsHint: 'Our starting figures. Change any of them.',
    management: 'Letting agent (% of rent)',
    maintenance: 'Maintenance (% of price a year)',
    insurance: 'Landlord insurance (£ a year)',
    voids: 'Empty weeks a year',
    groundRent: 'Ground rent or service charge (£ a year)',
    submit: 'Work out my yield',
  },
  errors: {
    price: 'Enter what you are paying.',
    rent: 'Enter the monthly rent.',
    blank: 'Fill this in, or put 0.',
    negative: 'This cannot be below zero.',
    voids: 'Use 52 weeks or fewer.',
    /** Shown beside the button when the fault is hidden in the costs section. */
    inCosts: 'Check the running costs: something is missing.',
  },
  /** The answer names both figures and the gap between them. */
  answer: (net: string, gross: string, gap: string): string =>
    `Net yield is ${net}. Gross is ${gross} — the ${gap} difference is your running costs.`,
  negative: (gross: string): string =>
    `The costs are bigger than the rent, so the net yield is below zero. Gross is ${gross}.`,
  figures: { net: 'Net yield', gross: 'Gross yield', costs: 'Running costs a year' },
  limits: [
    'Net is the number that matters. Gross ignores every cost.',
    'The rent and the costs are yours: we do not know them.',
    'Neither figure includes a mortgage, and neither is a promise.',
    'Both divide by the price. The analyser uses your all-in cost.',
  ],
  /** The maths panel rows. The cost labels drop the unit: the panel shows £. */
  table: { rent: 'Annual rent', total: 'Total running costs', gross: 'Gross yield', net: 'Net yield' },
  costLines: {
    management: 'Letting agent',
    maintenance: 'Maintenance',
    insurance: 'Landlord insurance',
    voids: 'Empty weeks',
    groundRent: 'Ground rent or service charge',
  },
  onward: {
    line: 'Yield is step one. The analyser adds the mortgage, the stress test and the tax.',
    cta: 'Open the buy-to-let analyser',
  },
  howBody: 'Gross yield is a year of rent over the price. Net takes your running costs off the rent first.',
} as const;

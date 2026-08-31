import type { StrategyConfig, StrategyField } from './types';

const btlInputs: StrategyField[] = [
  { key: 'rent', label: 'Monthly rent', kind: 'number', unit: '£/month', default: '', tip: 'What it would let for each month.' },
  { key: 'deposit', label: 'Deposit', kind: 'number', unit: '%', default: '25', tip: 'Your cash share of the price — lenders usually want 25%.' },
  { key: 'rate', label: 'Mortgage rate', kind: 'number', unit: '%', default: '5.0', tip: 'The interest rate on the mortgage.' },
  {
    key: 'buyingAs', label: 'Buying as', kind: 'select', default: 'basic',
    options: [
      { value: 'basic', label: 'Personally — basic-rate' },
      { value: 'higher', label: 'Personally — higher-rate' },
      { value: 'ltd', label: 'Through a company' },
    ],
    tip: 'Changes how the rental profit is taxed.',
  },
  {
    key: 'mgmt', label: 'Management', kind: 'select', default: 'agent',
    options: [
      { value: 'agent', label: 'Letting agent' },
      { value: 'self', label: 'Self-managed' },
    ],
    tip: 'An agent takes a slice of the rent; self-managing takes your time.',
  },
];

const btlAssumptions: StrategyField[] = [
  { key: 'voidWeeks', label: 'Void allowance', kind: 'number', unit: 'weeks/yr', default: '5', tip: 'Weeks a year with no tenant.', whyDefault: 'Around 5 weeks a year of empty periods is a common planning figure.' },
  { key: 'agentPct', label: 'Agent management fee', kind: 'number', unit: '% of rent', default: '12', tip: 'What a letting agent charges.', whyDefault: 'Full management typically costs 10–15% of rent; 12% is mid-range. Ignored when self-managing.' },
  { key: 'maintPct', label: 'Maintenance', kind: 'number', unit: '% of price/yr', default: '1', tip: 'Yearly upkeep budget.', whyDefault: '1% of the purchase price a year is a standard upkeep rule of thumb.' },
  { key: 'insurance', label: 'Landlord insurance', kind: 'number', unit: '£/yr', default: '300', tip: 'Buildings + landlord cover.', whyDefault: 'A typical single-let policy runs £250–£400 a year.' },
  { key: 'legals', label: 'Legal & survey costs', kind: 'number', unit: '£', default: '1500', tip: 'Conveyancing and survey.', whyDefault: 'Conveyancing plus a survey usually lands near £1,500.' },
  { key: 'refurbCost', label: 'Refurb budget', kind: 'number', unit: '£', default: '0', tip: 'Work needed before letting.', whyDefault: 'Zero unless you know work is needed — it counts in your cash in.' },
  {
    key: 'mortType', label: 'Mortgage type', kind: 'select', default: 'io',
    options: [{ value: 'io', label: 'Interest-only' }],
    tip: 'Interest-only keeps payments low; the loan is not paid down.', whyDefault: 'Most landlords use interest-only; repayment modelling arrives later.',
  },
  { key: 'stressRate', label: 'ICR stress rate', kind: 'number', unit: '%', default: '5.5', tip: 'The pretend higher interest rate a lender checks the rent against (ICR = interest cover ratio).', whyDefault: 'Lenders commonly stress-test at around 5.5% even when your pay rate is lower.' },
  {
    key: 'taxBasis', label: 'Purchase tax basis', kind: 'select', default: 'additional',
    options: [
      { value: 'additional', label: 'Additional property' },
      { value: 'standard', label: 'Only property' },
      { value: 'firstTimeBuyer', label: 'First-time buyer' },
    ],
    tip: 'A second property pays the higher stamp-duty rates.', whyDefault: 'Most investors already own a home, so the additional-property rates apply.',
  },
];

export const strategies: StrategyConfig[] = [
  {
    id: 'btl',
    name: 'Buy to let',
    shortName: 'BTL',
    route: '/buy-to-let',
    tagline: 'Will it wash its face? Yield, cashflow and value in one place.',
    heroLine: 'Check any England & Wales buy-to-let against real sold prices.',
    strategyInputs: btlInputs,
    assumptions: btlAssumptions,
    // Verdict thresholds (logged in DECISIONS_LOG): tune here, never in code.
    thresholds: { minCashflowGreen: 150, minRoiGreen: 8, icrBasic: 1.25, icrHigher: 1.45 },
    verdictSlot: 'BtlVerdict',
    copy: {},
  },
  {
    id: 'flip',
    name: 'Flip',
    route: '/flip',
    tagline: 'Buy, refurbish, sell — is the margin really there?',
    heroLine: 'Stress-test a flip with real local sold prices and honest ranges.',
    strategyInputs: [
      { key: 'refurbCost', label: 'Refurb budget', kind: 'number', unit: '£', default: '', tip: 'Everything the works will cost.' },
      { key: 'gdv', label: 'Sale price after works', kind: 'number', unit: '£', default: '', tip: 'What it should sell for once the works are done — the gross development value (GDV).' },
      {
        key: 'funding', label: 'Funding the purchase', kind: 'select', default: 'bridging',
        options: [
          { value: 'bridging', label: 'Bridging loan' },
          { value: 'cash', label: 'Cash' },
        ],
        tip: 'Short-term money for the buy-and-refurb phase.',
      },
      { key: 'bridgeMonths', label: 'Months to sale', kind: 'number', unit: 'months', default: '6', tip: 'Most buyers’ lenders won’t mortgage a property resold within 6 months of purchase — plan the timeline around it.' },
      { key: 'agentSalePct', label: 'Estate agent fee', kind: 'number', unit: '% + VAT', default: '1.2', tip: 'What the selling agent charges, before VAT.' },
      { key: 'saleLegals', label: 'Selling legals', kind: 'number', unit: '£', default: '1200', tip: 'Conveyancing on the sale.' },
      {
        key: 'flipAs', label: 'Buying as', kind: 'select', default: 'personal',
        options: [
          { value: 'personal', label: 'Personally' },
          { value: 'ltd', label: 'Through a company' },
        ],
        tip: 'Changes how the profit is taxed — both scenarios are shown either way.',
      },
    ],
    assumptions: [
      { key: 'bridgeLoanPct', label: 'Bridging loan size', kind: 'number', unit: '% of price', default: '75', tip: 'The share of the price the bridge advances.', whyDefault: 'Bridging lenders commonly advance around 75% of the purchase price.' },
      { key: 'bridgeRate', label: 'Bridging rate', kind: 'number', unit: '%/month', default: '0.85', tip: 'Bridging is priced monthly.', whyDefault: 'Around 0.85% a month is a typical bridging rate as of 2026.' },
      { key: 'arrangementPct', label: 'Bridging arrangement fee', kind: 'number', unit: '%', default: '2', tip: 'Charged on the bridging loan.', whyDefault: '2% of the loan is the standard arrangement fee.' },
      { key: 'exitPct', label: 'Bridging exit fee', kind: 'number', unit: '%', default: '0', tip: 'Some bridges charge on the way out.', whyDefault: 'Many bridges have no exit fee — check yours.' },
      { key: 'legals', label: 'Purchase legals & survey', kind: 'number', unit: '£', default: '1500', tip: 'Conveyancing and survey on purchase.', whyDefault: 'Conveyancing plus a survey usually lands near £1,500.' },
      { key: 'contingencyPct', label: 'Contingency', kind: 'number', unit: '% of refurb', default: '10', tip: 'Refurbs run over — budget for it.', whyDefault: '10% of the refurb budget is the standard buffer for surprises.' },
      {
        key: 'incomeBand', label: 'Your other income band', kind: 'select', default: 'higher',
        options: [
          { value: 'basic', label: 'Basic rate' },
          { value: 'higher', label: 'Higher rate' },
        ],
        tip: 'Flip profit stacks on top of your other income.',
        whyDefault: 'Most flippers already earn into the higher band, so their flip profit is taxed there too.',
      },
      {
        key: 'taxBasis', label: 'Purchase tax basis', kind: 'select', default: 'additional',
        options: [
          { value: 'additional', label: 'Additional property' },
          { value: 'standard', label: 'Only property' },
        ],
        tip: 'A second property pays the higher rates. Companies always pay them.', whyDefault: 'Most flippers already own a home; buying through a company always pays the higher rates.',
      },
    ],
    // Verdict thresholds (logged): after-tax ROI leads, before-tax profit floors it.
    thresholds: { greenRoi: 20, greenProfit: 15000, amberRoi: 10 },
    verdictSlot: 'FlipVerdict',
    copy: {},
    flags: { showGdvModule: true },
  },
  {
    id: 'brrrr',
    name: 'BRRRR',
    route: '/brrrr',
    tagline: 'Buy, refurbish, rent, refinance, repeat — how much stays in?',
    heroLine: 'See whether the refinance really pulls your money back out.',
    strategyInputs: [
      { key: 'refurbCost', label: 'Refurb budget', kind: 'number', unit: '£', default: '', tip: 'Everything the works will cost.' },
      { key: 'arv', label: 'End value after works', kind: 'number', unit: '£', default: '', tip: 'What it should be worth once the works are done — the after-repair value (ARV).' },
      {
        key: 'funding', label: 'Funding the purchase', kind: 'select', default: 'bridging',
        options: [
          { value: 'bridging', label: 'Bridging loan' },
          { value: 'cash', label: 'Cash' },
        ],
        tip: 'Short-term money for the buy-and-refurb phase.',
      },
      { key: 'bridgeMonths', label: 'Months until refinance', kind: 'number', unit: 'months', default: '6', tip: 'Most lenders want you to have owned it about six months before refinancing.' },
      { key: 'rent', label: 'Rent after works', kind: 'number', unit: '£/month', default: '', tip: 'What it will let for once refurbished.' },
      {
        key: 'ltv', label: 'Refinance loan-to-value', kind: 'select', default: '75',
        options: [
          { value: '75', label: '75%' },
          { value: '70', label: '70%' },
          { value: '65', label: '65%' },
          { value: 'custom', label: 'Custom %' },
        ],
        tip: 'The share of the end value the new mortgage advances.',
      },
      { key: 'ltvCustom', label: 'Custom LTV', kind: 'number', unit: '%', default: '', tip: 'Your own loan-to-value (LTV): the loan as a % of the property value. E.g. 78.9.', showWhen: { key: 'ltv', value: 'custom' } },
      {
        key: 'buyingAs', label: 'Buying as', kind: 'select', default: 'basic',
        options: [
          { value: 'basic', label: 'Personally — basic-rate' },
          { value: 'higher', label: 'Personally — higher-rate' },
          { value: 'ltd', label: 'Through a company' },
        ],
        tip: 'Changes how the rental profit is taxed.',
      },
    ],
    assumptions: [
      { key: 'bridgeLoanPct', label: 'Bridging loan size', kind: 'number', unit: '% of price', default: '75', tip: 'The share of the price the bridge advances.', whyDefault: 'Bridging lenders commonly advance around 75% of the purchase price.' },
      { key: 'bridgeRate', label: 'Bridging rate', kind: 'number', unit: '%/month', default: '0.85', tip: 'Bridging is priced monthly.', whyDefault: 'Around 0.85% a month is a typical bridging rate as of 2026.' },
      { key: 'arrangementPct', label: 'Bridging arrangement fee', kind: 'number', unit: '%', default: '2', tip: 'Charged on the bridging loan.', whyDefault: '2% of the loan is the standard arrangement fee.' },
      { key: 'exitPct', label: 'Bridging exit fee', kind: 'number', unit: '%', default: '0', tip: 'Some bridges charge on the way out.', whyDefault: 'Many bridges have no exit fee — check yours.' },
      { key: 'legals', label: 'Legal & survey costs', kind: 'number', unit: '£', default: '1500', tip: 'Conveyancing and survey on purchase.', whyDefault: 'Conveyancing plus a survey usually lands near £1,500.' },
      { key: 'refiLegals', label: 'Refinance legals', kind: 'number', unit: '£', default: '1000', tip: 'The remortgage has its own legal work.', whyDefault: 'A remortgage typically costs about £1,000 in legals and fees.' },
      { key: 'voidWeeks', label: 'Void allowance', kind: 'number', unit: 'weeks/yr', default: '5', tip: 'Weeks a year with no tenant.', whyDefault: 'Around 5 weeks a year of empty periods is a common planning figure.' },
      { key: 'agentPct', label: 'Agent management fee', kind: 'number', unit: '% of rent', default: '12', tip: 'What a letting agent charges.', whyDefault: 'Full management typically costs 10–15% of rent.' },
      { key: 'maintPct', label: 'Maintenance', kind: 'number', unit: '% of value/yr', default: '1', tip: 'Yearly upkeep budget on the end value.', whyDefault: '1% of the property value a year is a standard upkeep rule of thumb.' },
      { key: 'insurance', label: 'Landlord insurance', kind: 'number', unit: '£/yr', default: '300', tip: 'Buildings + landlord cover.', whyDefault: 'A typical single-let policy runs £250–£400 a year.' },
      { key: 'rate', label: 'Refinance interest rate', kind: 'number', unit: '%', default: '5.0', tip: 'The rate on the new mortgage.', whyDefault: 'A mid-range buy-to-let remortgage rate as of 2026.' },
      { key: 'stressRate', label: 'ICR stress rate', kind: 'number', unit: '%', default: '5.5', tip: 'The pretend higher interest rate a lender checks the rent against (ICR = interest cover ratio).', whyDefault: 'Lenders commonly stress-test at around 5.5%.' },
      {
        key: 'taxBasis', label: 'Purchase tax basis', kind: 'select', default: 'additional',
        options: [
          { value: 'additional', label: 'Additional property' },
          { value: 'standard', label: 'Only property' },
          { value: 'firstTimeBuyer', label: 'First-time buyer' },
        ],
        tip: 'A second property pays the higher stamp-duty rates.', whyDefault: 'Most investors already own a home.',
      },
    ],
    // Verdict thresholds (logged): green = effectively all out (≤ £2,500 in)
    // + cashflows ≥ £100 after tax + ICR passes.
    thresholds: { allOutMax: 2500, minCashflowGreen: 100, icrBasic: 1.25, icrHigher: 1.45 },
    verdictSlot: 'BrrrrVerdict',
    copy: {},
  },
  {
    id: 'hmo',
    name: 'HMO',
    route: '/hmo',
    tagline: 'Room-by-room income against the real local evidence.',
    heroLine: 'Analyse a small HMO deal on real sold prices — no guesswork.',
    strategyInputs: [
      {
        key: 'rooms', label: 'Lettable rooms', kind: 'select', default: '4',
        options: [
          { value: '3', label: '3 rooms' },
          { value: '4', label: '4 rooms' },
          { value: '5', label: '5 rooms' },
          { value: '6', label: '6 rooms' },
          { value: '7plus', label: '7 or more' },
        ],
        tip: 'Small HMOs house 3–6 people (planning class C4).',
      },
      { key: 'roomRent', label: 'Average rent per room', kind: 'number', unit: '£/month', default: '', tip: 'Find local room rates yourself: ask letting agents what rooms actually let for, and check what similar rooms advertise at.' },
      {
        key: 'bills', label: 'Bills included in rent?', kind: 'select', default: 'yes',
        options: [
          { value: 'yes', label: 'Yes — all-inclusive' },
          { value: 'no', label: 'No — tenants pay bills' },
        ],
        tip: 'Most rooms let all-inclusive. If tenants pay bills, lower the operating % in assumptions to match.',
      },
      { key: 'refurbCost', label: 'Conversion / refurb budget', kind: 'number', unit: '£', default: '', tip: 'Fire doors, locks, en-suites — HMO conversions cost real money.' },
      {
        key: 'buyingAs', label: 'Buying as', kind: 'select', default: 'basic',
        options: [
          { value: 'basic', label: 'Personally — basic-rate' },
          { value: 'higher', label: 'Personally — higher-rate' },
          { value: 'ltd', label: 'Through a company' },
        ],
        tip: 'Changes how the rental profit is taxed.',
      },
      {
        key: 'mgmt', label: 'Management', kind: 'select', default: 'agent',
        options: [
          { value: 'agent', label: 'Letting agent' },
          { value: 'self', label: 'Self-managed' },
        ],
        tip: 'HMO management is real work — rooms turn over faster than whole houses.',
      },
    ],
    assumptions: [
      { key: 'deposit', label: 'Deposit', kind: 'number', unit: '%', default: '25', tip: 'Your cash share of the price.', whyDefault: 'HMO lenders usually want at least 25%.' },
      { key: 'rate', label: 'HMO mortgage rate', kind: 'number', unit: '%', default: '6.0', tip: 'HMO mortgages price higher than single lets.', whyDefault: 'HMO products typically cost ~1% more than standard buy-to-let as of 2026.' },
      { key: 'opCostPctSelf', label: 'Operating costs (self-managed)', kind: 'number', unit: '% of income', default: '23', tip: 'Everything it costs to run the rooms.', whyDefault: 'Bills, broadband, cleaning, voids, maintenance and insurance typically absorb ~23% when you manage it yourself.' },
      { key: 'opCostPctAgent', label: 'Operating costs (agent + bills)', kind: 'number', unit: '% of income', default: '40', tip: 'Everything including agent management.', whyDefault: 'Add full management to bills, broadband, cleaning, voids, maintenance and insurance and ~40% of room income is a realistic planning figure.' },
      { key: 'licenceFee', label: 'HMO licence fee', kind: 'number', unit: '£ / 5 years', default: '1200', tip: 'Licences run five years and are budgeted yearly here.', whyDefault: 'Councils typically charge £1,000–£1,500 for a five-year licence.' },
      { key: 'compliancePerYear', label: 'Compliance costs', kind: 'number', unit: '£/yr', default: '600', tip: 'Fire alarm servicing, electrical (EICR), gas safety, fire risk assessment.', whyDefault: 'Annual servicing and certificates for a small HMO usually total ~£600.' },
      { key: 'legals', label: 'Legal & survey costs', kind: 'number', unit: '£', default: '1500', tip: 'Conveyancing and survey.', whyDefault: 'Conveyancing plus a survey usually lands near £1,500.' },
      { key: 'stressRate', label: 'ICR stress rate', kind: 'number', unit: '%', default: '5.5', tip: 'The pretend higher interest rate a lender checks the room income against (ICR = interest cover ratio).', whyDefault: 'Lenders commonly stress-test at around 5.5%.' },
      {
        key: 'taxBasis', label: 'Purchase tax basis', kind: 'select', default: 'additional',
        options: [
          { value: 'additional', label: 'Additional property' },
          { value: 'standard', label: 'Only property' },
        ],
        tip: 'A second property pays the higher stamp-duty rates.', whyDefault: 'Most investors already own a home.',
      },
    ],
    // Verdict thresholds (logged): HMOs must earn their extra work.
    thresholds: { minCashflowGreen: 400, minRoiGreen: 12, icrBasic: 1.25, icrHigher: 1.45 },
    verdictSlot: 'HmoVerdict',
    copy: {},
  },
];

export const strategyById = (id: string): StrategyConfig | undefined =>
  strategies.find((s) => s.id === id);
export type { StrategyConfig, StrategyField };

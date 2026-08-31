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
  { key: 'stressRate', label: 'ICR stress rate', kind: 'number', unit: '%', default: '5.5', tip: 'The rate lenders test the rent against.', whyDefault: 'Lenders commonly stress-test at around 5.5% even when your pay rate is lower.' },
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
    strategyInputs: [],
    assumptions: [],
    thresholds: {},
    verdictSlot: null,
    copy: {},
  },
  {
    id: 'brrrr',
    name: 'BRRRR',
    route: '/brrrr',
    tagline: 'Buy, refurbish, rent, refinance, repeat — how much stays in?',
    heroLine: 'See whether the refinance really pulls your money back out.',
    strategyInputs: [],
    assumptions: [],
    thresholds: {},
    verdictSlot: null,
    copy: {},
  },
  {
    id: 'hmo',
    name: 'HMO',
    route: '/hmo',
    tagline: 'Room-by-room income against the real local evidence.',
    heroLine: 'Analyse an HMO deal on real sold prices — no guesswork.',
    strategyInputs: [],
    assumptions: [],
    thresholds: {},
    verdictSlot: null,
    copy: {},
  },
];

export const strategyById = (id: string): StrategyConfig | undefined =>
  strategies.find((s) => s.id === id);
export type { StrategyConfig, StrategyField };

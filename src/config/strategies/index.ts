import type { StrategyConfig } from './types';

const SHARED_INPUTS = [
  'postcode', 'price', 'propertyType', 'areaSqm', 'bedrooms', 'bathrooms',
  'refurbLevel', 'ageBand', 'garden', 'parking',
];

export const strategies: StrategyConfig[] = [
  {
    id: 'btl',
    name: 'Buy to let',
    shortName: 'BTL',
    route: '/buy-to-let',
    tagline: 'Will it wash its face? Yield, cashflow and value in one place.',
    heroLine: 'Check any England & Wales buy-to-let against real sold prices.',
    inputs: { visible: SHARED_INPUTS, assumptions: [] },
    verdictSlot: null,
    copy: {},
  },
  {
    id: 'flip',
    name: 'Flip',
    route: '/flip',
    tagline: 'Buy, refurbish, sell — is the margin really there?',
    heroLine: 'Stress-test a flip with real local sold prices and honest ranges.',
    inputs: { visible: SHARED_INPUTS, assumptions: [] },
    verdictSlot: null,
    copy: {},
  },
  {
    id: 'brrrr',
    name: 'BRRRR',
    route: '/brrrr',
    tagline: 'Buy, refurbish, rent, refinance, repeat — how much stays in?',
    heroLine: 'See whether the refinance really pulls your money back out.',
    inputs: { visible: SHARED_INPUTS, assumptions: [] },
    verdictSlot: null,
    copy: {},
  },
  {
    id: 'hmo',
    name: 'HMO',
    route: '/hmo',
    tagline: 'Room-by-room income against the real local evidence.',
    heroLine: 'Analyse an HMO deal on real sold prices — no guesswork.',
    inputs: { visible: SHARED_INPUTS, assumptions: [] },
    verdictSlot: null,
    copy: {},
  },
];

export const strategyById = (id: string): StrategyConfig | undefined =>
  strategies.find((s) => s.id === id);
export type { StrategyConfig };

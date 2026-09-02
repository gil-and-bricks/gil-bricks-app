/**
 * Hardcoded sample inputs for the E4 scaffold — a stand-in for the extractor
 * that lands in a later sprint. These are a real Buy-to-Let deal; the extension
 * feeds them through @gil-bricks/core's `scoreDeal` to prove the shared library
 * (and the E2.1 deal-specific headline templates) work unchanged inside the
 * extension. Thresholds come from the strategy CONFIG in core — never hardcoded
 * here — so the extension scores identically to the web app for these inputs.
 */
import { strategyById, type BtlInputs, type StrategyId } from '@gil-bricks/core';

const btl = strategyById('btl');
if (!btl) throw new Error('BTL strategy config missing from @gil-bricks/core');

export const SAMPLE_STRATEGY: StrategyId = 'btl';

export const SAMPLE_INPUTS: BtlInputs = {
  price: 150000,
  country: 'E92000001',
  monthlyRent: 1100,
  depositPct: 25,
  ratePct: 5,
  buyingAs: 'basic',
  selfManaged: false,
  voidWeeks: 5,
  agentPct: 12,
  maintPct: 1,
  insurancePerYear: 300,
  legals: 1500,
  refurb: 0,
  stressRatePct: 5.5,
  taxBasis: 'additional',
  thresholds: btl.thresholds as BtlInputs['thresholds'],
};

/** A one-line label for the sample, shown in the panel so it's clearly a demo. */
export const SAMPLE_LABEL = 'Sample: 2-bed flat · £150,000 · £1,100/mo rent';

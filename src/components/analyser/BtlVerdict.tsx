/** The BTL verdict island — the ONLY BTL-specific code (the pattern for
 * S4.3–S4.5, see docs/STRATEGY_CONFIG_GUIDE.md). All maths comes from
 * src/lib/strategies/btl.ts, which composes the canonical maths lib. */
import { useEffect } from 'preact/hooks';
import type { StrategyConfig } from '../../config/strategies/types';
import type { ComparablesResult } from '../../lib/comparables/engine';
import type { Valuation } from '../../lib/valuation/engine';
import { analyseBtl, type BtlAnalysis } from '../../lib/strategies/btl';
import type { BuyerType } from '../../lib/maths/stampduty';
import { fmtMoney, fmtPct, fmtRatio } from '../../lib/maths/format';
import { initStrategyParams, state, strategyParams } from './state';
import { StrategyInputs } from './StrategyInputs';
import { MathsAccordion } from './Accordion';

// Thresholds MUST come from config — a missing key fails loudly, never
// silently reverts to a code constant.
function requireThresholds(config: StrategyConfig): { minCashflowGreen: number; minRoiGreen: number; icrBasic: number; icrHigher: number } {
  const t = config.thresholds;
  for (const k of ['minCashflowGreen', 'minRoiGreen', 'icrBasic', 'icrHigher']) {
    if (typeof t[k] !== 'number') throw new Error(`Strategy config is missing its "${k}" verdict threshold`);
  }
  return t as { minCashflowGreen: number; minRoiGreen: number; icrBasic: number; icrHigher: number };
}

export function BtlVerdict({ config, comps, valuation }: {
  config: StrategyConfig;
  comps: ComparablesResult | null;
  valuation: Valuation | null;
}) {
  const fields = [...config.strategyInputs, ...config.assumptions];
  useEffect(() => {
    initStrategyParams(fields);
  }, []);

  const s = state.value;
  const p = strategyParams.value;
  // fallbacks come from CONFIG defaults, never code literals (golden rule 2)
  const configDefault = (k: string): number => Number(fields.find((f) => f.key === k)?.default ?? 0);
  const num = (k: string): number => {
    const v = Number(p[k]);
    return Number.isFinite(v) && p[k] !== '' && p[k] !== undefined ? v : configDefault(k);
  };

  const rentOk = num('rent') > 0;
  let analysis: BtlAnalysis | null = null;
  let analysisError: string | null = null;
  if (rentOk && comps && Number(s.price) > 0) {
    try {
      analysis = analyseBtl({
        price: Number(s.price),
        country: comps.subject.country,
        monthlyRent: num('rent'),
        depositPct: num('deposit'),
        ratePct: num('rate'),
        buyingAs: (p.buyingAs as 'basic' | 'higher' | 'ltd') ?? 'basic',
        selfManaged: p.mgmt === 'self',
        voidWeeks: num('voidWeeks'),
        agentPct: num('agentPct'),
        maintPct: num('maintPct'),
        insurancePerYear: num('insurance'),
        legals: num('legals'),
        refurb: num('refurbCost'),
        stressRatePct: num('stressRate'),
        taxBasis: (p.taxBasis as BuyerType) ?? 'additional',
        thresholds: requireThresholds(config),
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      // internal guard messages are for developers; users get plain English
      analysisError = /must be|cannot be/.test(raw)
        ? 'These numbers don’t work together — check the deposit, rate, rent and assumption values.'
        : raw;
    }
  }

  const price = Number(s.price);
  const taxName = comps?.subject.country === 'W92000004' ? 'Land Transaction Tax' : 'Stamp Duty';

  return (
    <section class="glass card" aria-labelledby="verdict-h">
      <h2 id="verdict-h">{config.name} verdict</h2>
      <StrategyInputs visible={config.strategyInputs} assumptions={config.assumptions} />
      {!rentOk && <p class="hint">Add the monthly rent to get a verdict.</p>}
      {analysisError && <p class="field-error" role="alert">{analysisError}</p>}
      {analysis && (
        <>
          <div class={`verdict-banner verdict-${analysis.verdict}`} role="status">
            <p class="verdict-line">{analysis.verdictCopy}</p>
            {analysis.lever && <p class="verdict-lever">{analysis.lever}</p>}
            {valuation && price > 0 && (
              <p class="verdict-crosscheck">
                Asking {fmtMoney(price)} vs our estimate {fmtMoney(valuation.estimate)} ({fmtMoney(valuation.range.low)}–{fmtMoney(valuation.range.high)}).
                {price > valuation.range.high && ' Looks expensive vs sold evidence.'}
                {price < valuation.range.low && ' Below sold evidence — check why.'}
              </p>
            )}
          </div>
          <div class="tiles">
            <Tile label="ROI" value={fmtPct(analysis.roi.value)} breakdown={analysis.roi.breakdown} />
            <Tile label="Gross yield" value={fmtPct(analysis.grossYield.value)} breakdown={analysis.grossYield.breakdown} />
            <Tile label="Net yield" value={fmtPct(analysis.netYield.value)} breakdown={analysis.netYield.breakdown} />
            <Tile label="Cashflow after tax" value={`${fmtMoney(analysis.cashflowAfterTax.value)}/mo`} breakdown={analysis.cashflowAfterTax.breakdown} />
            <Tile label={`Cash in (incl. ${taxName})`} value={fmtMoney(analysis.cashIn.value)} breakdown={analysis.cashIn.breakdown}>
              <div class="bands">
                <p class="field-hint">{taxName}: {fmtMoney(analysis.stampDuty.value.tax)}</p>
                {analysis.stampDuty.value.bands.filter((b) => b.tax > 0).map((b) => (
                  <p class="field-hint">{fmtPct(b.rate * 100)} on {fmtMoney(b.slice)} = {fmtMoney(b.tax)}</p>
                ))}
              </div>
            </Tile>
            <Tile
              label={`ICR (${Math.round(analysis.icr.threshold * 100)}% test)`}
              value={`${fmtRatio(analysis.icr.value)} — ${analysis.icr.passes ? 'passes' : 'fails'}`}
              breakdown={analysis.icr.breakdown}
            />
            <Tile label="Tax on rent" value={`${fmtMoney(analysis.taxPerYear.value)}/yr`} breakdown={analysis.taxPerYear.breakdown} />
            <Tile label="Cashflow before tax" value={`${fmtMoney(analysis.cashflowBeforeTax.value)}/mo`} breakdown={analysis.cashflowBeforeTax.breakdown} />
          </div>
        </>
      )}
    </section>
  );
}

function Tile({ label, value, breakdown, children }: {
  label: string;
  value: string;
  breakdown: import('../../lib/maths/breakdown').Breakdown;
  children?: preact.ComponentChildren;
}) {
  return (
    <div class="tile">
      <p class="tile-label">{label}</p>
      <p class="tile-value">{value}</p>
      {children}
      <MathsAccordion breakdown={breakdown} />
    </div>
  );
}

/** The Flip verdict island — config + src/lib/strategies/flip.ts only.
 * NO rental maths. ROI (after tax, selected scenario) leads. */
import { useEffect, useRef } from 'preact/hooks';
import type { StrategyConfig } from '../../config/strategies/types';
import type { ComparablesResult } from '../../lib/comparables/engine';
import type { Valuation } from '../../lib/valuation/engine';
import { analyseFlip, type FlipAnalysis } from '../../lib/strategies/flip';
import type { BuyerType } from '../../lib/maths/stampduty';
import { fmtMoney, fmtPct } from '../../lib/maths/format';
import { initStrategyParams, state, strategyParams, updateStrategy } from './state';
import { StrategyInputs } from './StrategyInputs';
import { MathsAccordion } from './Accordion';
import { GdvModule } from './GdvModule';

function requireThresholds(config: StrategyConfig): { greenRoi: number; greenProfit: number; amberRoi: number } {
  const t = config.thresholds;
  for (const k of ['greenRoi', 'greenProfit', 'amberRoi']) {
    if (typeof t[k] !== 'number') throw new Error(`Strategy config is missing its "${k}" verdict threshold`);
  }
  return t as { greenRoi: number; greenProfit: number; amberRoi: number };
}

export function FlipVerdict({ config, comps, valuation }: {
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
  const configDefault = (k: string): number => Number(fields.find((f) => f.key === k)?.default ?? 0);
  const num = (k: string): number => {
    const v = Number(p[k]);
    return Number.isFinite(v) && p[k] !== '' && p[k] !== undefined ? v : configDefault(k);
  };

  // GDV pre-fill: once, never overwriting the user; hint only while ours.
  const prefilled = useRef<string | null>(null);
  const diverged = useRef(false);
  useEffect(() => {
    if (prefilled.current === null && valuation && (strategyParams.value.gdv ?? '') === '') {
      prefilled.current = String(Math.round(valuation.estimate));
      updateStrategy({ gdv: prefilled.current });
    }
  }, [valuation]);
  useEffect(() => {
    // once the user diverges from the pre-fill, never claim it again
    if (prefilled.current !== null && (p.gdv ?? '') !== prefilled.current) diverged.current = true;
  }, [p.gdv]);

  const isLtd = p.flipAs === 'ltd';
  const ready = num('gdv') > 0 && Number(s.price) > 0;

  let analysis: FlipAnalysis | null = null;
  let analysisError: string | null = null;
  if (ready && comps) {
    try {
      analysis = analyseFlip({
        price: Number(s.price),
        country: comps.subject.country,
        refurb: num('refurbCost'),
        gdv: num('gdv'),
        funding: p.funding === 'cash' ? 'cash' : 'bridging',
        months: num('bridgeMonths'),
        agentSalePctExVat: num('agentSalePct'),
        saleLegals: num('saleLegals'),
        flipAs: isLtd ? 'ltd' : 'personal',
        incomeBand: p.incomeBand === 'basic' ? 'basic' : 'higher',
        bridgeLoanPct: num('bridgeLoanPct'),
        bridgeRatePctMonth: num('bridgeRate'),
        arrangementPct: num('arrangementPct'),
        exitPct: num('exitPct'),
        legals: num('legals'),
        contingencyPct: num('contingencyPct'),
        taxBasis: (p.taxBasis as BuyerType) ?? 'additional',
        thresholds: requireThresholds(config),
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      analysisError = /must be|cannot be/.test(raw)
        ? 'These numbers don’t work together — check the price, sale price and refurb values.'
        : raw;
    }
  }

  const gdv = num('gdv');
  return (
    <section class="glass card" aria-labelledby="verdict-h">
      <h2 id="verdict-h">{config.name} verdict</h2>
      <StrategyInputs visible={config.strategyInputs} assumptions={config.assumptions} />
      {valuation && prefilled.current !== null && !diverged.current && (strategyParams.value.gdv ?? '') === prefilled.current && (
        <p class="field-hint">
          Sale price pre-filled from our estimate ({fmtMoney(valuation.estimate)}) — it reflects typical sold
          condition for the area; raise it only if your finish will clearly beat local stock.
        </p>
      )}
      {isLtd && <p class="field-hint">Buying through a company always pays the higher purchase-tax rates — applied automatically.</p>}
      {!ready && <p class="hint">Add the refurb budget and the sale price after works to get a verdict.</p>}
      {analysisError && <p class="field-error" role="alert">{analysisError}</p>}
      {analysis && (
        <>
          <div class={`verdict-banner verdict-${analysis.verdict}`} role="status">
            <p class="verdict-line">{analysis.verdictCopy}</p>
            {analysis.lever && <p class="verdict-lever">{analysis.lever}</p>}
            {valuation && gdv > 0 && (
              <p class="verdict-crosscheck">
                Your sale price {fmtMoney(gdv)} vs our estimate {fmtMoney(valuation.estimate)} ({fmtMoney(valuation.range.low)}–{fmtMoney(valuation.range.high)}).
                {gdv > valuation.range.high && ' Ambitious — get a broker’s opinion before relying on it.'}
              </p>
            )}
          </div>
          <p class="hint">Buy-refurb-sell for profit is normally taxed as trading income, not capital gains. This is not tax advice — check with an accountant.</p>
          <div class="tiles">
            <div class="tile tile-hero">
              <p class="tile-label">Project return after tax ({isLtd ? 'company' : 'personal'})</p>
              <p class="tile-value">{fmtPct(analysis.roiAfterTax.value)}</p>
              <p class="field-hint">before tax: {fmtPct(analysis.roiBeforeTax.value)}</p>
              <MathsAccordion breakdown={analysis.roiAfterTax.breakdown} />
            </div>
            <Tile label="Profit before tax" value={fmtMoney(analysis.profitBeforeTax.value)} breakdown={analysis.profitBeforeTax.breakdown} />
            <div class="tile">
              <p class="tile-label">Tax on the profit</p>
              <div class="tax-compare">
                <div class={!isLtd ? 'tax-col tax-selected' : 'tax-col'}>
                  <p class="tile-label">Personally</p>
                  <p class="tile-value">{fmtMoney(analysis.personalTax.value)}</p>
                  <MathsAccordion breakdown={analysis.personalTax.breakdown} />
                </div>
                <div class={isLtd ? 'tax-col tax-selected' : 'tax-col'}>
                  <p class="tile-label">Company</p>
                  <p class="tile-value">{fmtMoney(analysis.companyTax.value)}</p>
                  <MathsAccordion breakdown={analysis.companyTax.breakdown} />
                  <p class="field-hint">Taking the money out of the company personally is taxed again.</p>
                </div>
              </div>
            </div>
            <Tile label="Profit after tax" value={fmtMoney(analysis.profitAfterTax.value)} breakdown={analysis.profitAfterTax.breakdown} />
            <Tile label="Total cost in" value={fmtMoney(analysis.totalCostIn.value)} breakdown={analysis.totalCostIn.breakdown} />
            <Tile label="Cash invested" value={fmtMoney(analysis.cashInvested.value)} breakdown={analysis.cashInvested.breakdown} />
            {analysis.financeCosts && (
              <Tile label="Finance costs" value={fmtMoney(analysis.financeCosts.value)} breakdown={analysis.financeCosts.breakdown} />
            )}
            <Tile label="Max offer for a Green flip"
              value={analysis.maxOfferGreen !== null ? fmtMoney(analysis.maxOfferGreen) : 'Not reachable'}
              breakdown={{
                label: 'Max offer for Green', formula: 'the highest price that keeps the flip Green, solved against the same maths',
                substituted: `sale price ${fmtMoney(gdv)}, your costs and tax scenario`,
                result: analysis.maxOfferGreen !== null ? fmtMoney(analysis.maxOfferGreen) : 'no price achieves it',
                note: 'your negotiating ceiling if the margin matters',
              }} />
            <Tile label="Sale price needed for Green"
              value={analysis.gdvNeededGreen !== null ? fmtMoney(analysis.gdvNeededGreen) : 'Not reachable'}
              breakdown={{
                label: 'Sale price needed for Green', formula: 'the smallest sale price that makes the flip Green',
                substituted: `price ${fmtMoney(Number(s.price))}, your costs and tax scenario`,
                result: analysis.gdvNeededGreen !== null ? fmtMoney(analysis.gdvNeededGreen) : 'no sale price achieves it',
                note: 'only believe it if the sold evidence does',
              }} />
            {config.flags?.showGdvModule && (
              <GdvModule pct={analysis.profitOnGdvPct.value} breakdown={analysis.profitOnGdvPct.breakdown} />
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Tile({ label, value, breakdown }: {
  label: string;
  value: string;
  breakdown: import('../../lib/maths/breakdown').Breakdown;
}) {
  return (
    <div class="tile">
      <p class="tile-label">{label}</p>
      <p class="tile-value">{value}</p>
      <MathsAccordion breakdown={breakdown} />
    </div>
  );
}

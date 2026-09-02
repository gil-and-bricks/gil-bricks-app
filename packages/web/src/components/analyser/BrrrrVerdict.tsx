/** The BRRRR verdict island — config + @gil-bricks/core (strategy-calc/brrrr) only. */
import { keyFigure } from './keyFigure';
import { useEffect, useRef } from 'preact/hooks';
import type { StrategyConfig } from '@gil-bricks/core';
import type { ComparablesResult } from '@gil-bricks/core';
import type { Valuation } from '@gil-bricks/core';
import { analyseBrrrr, type BrrrrAnalysis } from '@gil-bricks/core';
import type { BuyerType } from '@gil-bricks/core';
import { fmtMoney, fmtPct, fmtRatio } from '@gil-bricks/core';
import { initStrategyParams, state, strategyParams, updateStrategy } from './state';
import { StrategyInputs } from './StrategyInputs';
import { MathsAccordion } from './Accordion';

function requireThresholds(config: StrategyConfig): { allOutMax: number; minCashflowGreen: number; icrBasic: number; icrHigher: number } {
  const t = config.thresholds;
  for (const k of ['allOutMax', 'minCashflowGreen', 'icrBasic', 'icrHigher']) {
    if (typeof t[k] !== 'number') throw new Error(`Strategy config is missing its "${k}" verdict threshold`);
  }
  return t as { allOutMax: number; minCashflowGreen: number; icrBasic: number; icrHigher: number };
}

export function BrrrrVerdict({ config, comps, valuation }: {
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

  // ARV pre-fill: our estimate reflects typical sold condition — offered
  // once, never overwriting a user-entered value.
  const prefilled = useRef<string | null>(null);
  useEffect(() => {
    if (prefilled.current === null && valuation && (strategyParams.value.arv ?? '') === '') {
      prefilled.current = String(Math.round(valuation.estimate));
      updateStrategy({ arv: prefilled.current });
    }
  }, [valuation]);

  const ltvPct = p.ltv === 'custom' ? num('ltvCustom') : (Number(p.ltv) || configDefault('ltv'));
  const ready = num('rent') > 0 && num('arv') > 0 && Number(s.price) > 0 && ltvPct > 0;

  let analysis: BrrrrAnalysis | null = null;
  let analysisError: string | null = null;
  if (ready && comps) {
    try {
      analysis = analyseBrrrr({
        price: Number(s.price),
        country: comps.subject.country,
        refurb: num('refurbCost'),
        arv: num('arv'),
        funding: p.funding === 'cash' ? 'cash' : 'bridging',
        bridgeMonths: num('bridgeMonths'),
        monthlyRent: num('rent'),
        ltvPct,
        buyingAs: (p.buyingAs as 'basic' | 'higher' | 'ltd') ?? 'basic',
        bridgeLoanPct: num('bridgeLoanPct'),
        bridgeRatePctMonth: num('bridgeRate'),
        arrangementPct: num('arrangementPct'),
        exitPct: num('exitPct'),
        legals: num('legals'),
        refiLegals: num('refiLegals'),
        voidWeeks: num('voidWeeks'),
        agentPct: num('agentPct'),
        maintPct: num('maintPct'),
        insurancePerYear: num('insurance'),
        refiRatePct: num('rate'),
        stressRatePct: num('stressRate'),
        taxBasis: (p.taxBasis as BuyerType) ?? 'additional',
        thresholds: requireThresholds(config),
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      analysisError = /must be|cannot be/.test(raw)
        ? 'These numbers don’t work together — check the price, end value, LTV and rent.'
        : raw;
    }
  }

  const arv = num('arv');
  // publish the headline for Save (S6.2)
  const headlineForSave = analysis ? analysis.outcomeVerdict : '';
  useEffect(() => {
    keyFigure.value = headlineForSave;
  }, [headlineForSave]);

  return (
    <section class="glass card" aria-labelledby="verdict-h">
      <h2 id="verdict-h">{config.name} verdict</h2>
      <StrategyInputs visible={config.strategyInputs} assumptions={config.assumptions} />
      {valuation && prefilled.current !== null && (strategyParams.value.arv ?? '') === prefilled.current && (
        <p class="field-hint">
          End value pre-filled from our estimate ({fmtMoney(valuation.estimate)}) — it reflects typical sold
          condition for the area; raise it only if your finish will clearly beat local stock.
        </p>
      )}
      {!ready && (
        <p class="hint">
          {p.ltv === 'custom' && num('ltvCustom') <= 0
            ? 'Enter your custom loan-to-value % to get a verdict.'
            : 'Add the end value after works and the rent after works to get a verdict — the refurb budget and price help too.'}
        </p>
      )}
      {analysisError && <p class="field-error" role="alert">{analysisError}</p>}
      {analysis && (
        <>
          <div class={`verdict-banner verdict-${analysis.verdict}`} role="status">
            <p class="verdict-line">{analysis.verdictCopy}</p>
            {analysis.lever && <p class="verdict-lever">{analysis.lever}</p>}
            {valuation && arv > 0 && (
              <p class="verdict-crosscheck">
                Your end value {fmtMoney(arv)} vs our estimate {fmtMoney(valuation.estimate)} ({fmtMoney(valuation.range.low)}–{fmtMoney(valuation.range.high)}).
                {arv > valuation.range.high && ' Ambitious — get a broker’s opinion before relying on it.'}
              </p>
            )}
          </div>
          <div class="tiles">
            <div class="tile tile-hero">
              <p class="tile-label">The outcome</p>
              <p class="tile-value">{analysis.outcomeVerdict}</p>
              <MathsAccordion breakdown={analysis.outcomeBreakdown} />
            </div>
            <Tile label="Max price for all money out"
              value={analysis.maxPriceAllOut !== null ? fmtMoney(analysis.maxPriceAllOut) : 'Not reachable'}
              breakdown={{
                label: 'Max price for all money out', formula: 'the highest price at which money left in is £0, solved against the same maths',
                substituted: `end value ${fmtMoney(arv)}, ${fmtPct(ltvPct)} LTV, your fees and refurb`,
                result: analysis.maxPriceAllOut !== null ? fmtMoney(analysis.maxPriceAllOut) : 'no price achieves it',
                note: 'your ceiling for offers if pulling everything out matters',
              }} />
            <Tile label="End value needed for all money out"
              value={analysis.arvNeededAllOut !== null ? fmtMoney(analysis.arvNeededAllOut) : 'Not reachable'}
              breakdown={{
                label: 'End value needed', formula: 'the smallest end value at which money left in is £0',
                substituted: `price ${fmtMoney(Number(s.price))}, ${fmtPct(ltvPct)} LTV, your fees and refurb`,
                result: analysis.arvNeededAllOut !== null ? fmtMoney(analysis.arvNeededAllOut) : 'no end value achieves it',
                note: 'compare it with our estimate before believing it',
              }} />
            <Tile label="Refinance loan" value={fmtMoney(analysis.refiLoan.value)} breakdown={analysis.refiLoan.breakdown} />
            <Tile label="Cash invested" value={fmtMoney(analysis.cashInvested.value)} breakdown={analysis.cashInvested.breakdown} />
            {analysis.bridging && (
              <Tile label="Bridging cost" value={fmtMoney(analysis.bridging.interest + analysis.bridging.arrangement + analysis.bridging.exit)} breakdown={analysis.bridging.breakdown} />
            )}
            <Tile label="Cashflow after tax" value={`${fmtMoney(analysis.cashflowAfterTax.value)}/mo`} breakdown={analysis.cashflowAfterTax.breakdown} />
            <Tile label="Return on money left in"
              value={analysis.roiOnLeftIn.value !== null ? fmtPct(analysis.roiOnLeftIn.value) : 'Effectively infinite'}
              breakdown={analysis.roiOnLeftIn.breakdown} />
            <Tile label="Gross yield on total cost" value={fmtPct(analysis.grossYieldOnCost.value)} breakdown={analysis.grossYieldOnCost.breakdown} />
            <Tile label={`Rent-covers-mortgage test (ICR ${Math.round(analysis.icr.threshold * 100)}%)`}
              value={`${fmtRatio(analysis.icr.value)} — ${analysis.icr.passes ? 'passes' : 'fails'}`}
              breakdown={analysis.icr.breakdown} />
          </div>
        </>
      )}
    </section>
  );
}

function Tile({ label, value, breakdown }: {
  label: string;
  value: string;
  breakdown: import('@gil-bricks/core').Breakdown;
}) {
  return (
    <div class="tile">
      <p class="tile-label">{label}</p>
      <p class="tile-value">{value}</p>
      <MathsAccordion breakdown={breakdown} />
    </div>
  );
}

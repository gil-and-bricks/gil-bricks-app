/** The BTL verdict island — the ONLY BTL-specific code (the pattern for
 * S4.3–S4.5, see docs/STRATEGY_CONFIG_GUIDE.md). All maths comes from
 * @gil-bricks/core (strategy-calc/btl), which composes the canonical maths lib. */
import { keyFigure } from './keyFigure';
import { COPY } from '../../config/copy';
import { verdictSnapshot } from './verdictSnapshot';
import { useEffect } from 'preact/hooks';
import type { StrategyConfig } from '@gil-bricks/core';
import type { ComparablesResult } from '@gil-bricks/core';
import type { Valuation } from '@gil-bricks/core';
import { analyseBtl, scoreDeal, type BtlAnalysis, type BtlInputs, type DealScore } from '@gil-bricks/core';
import { DealScoreChip, BindingConstraintNote } from './DealScore';
import { features, stickyVerdictActive } from '../../config/features';
import type { BuyerType } from '@gil-bricks/core';
import { fmtMoney, fmtPct, fmtRatio } from '@gil-bricks/core';
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
  let deal: DealScore | null = null;
  if (rentOk && comps && Number(s.price) > 0) {
    try {
      const inputs: BtlInputs = {
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
      };
      analysis = analyseBtl(inputs);
      if (features.dealScore) {
        deal = scoreDeal('btl', inputs, valuation ? { estimate: valuation.estimate, high: valuation.range.high } : undefined);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      // internal guard messages are for developers; users get plain English
      analysisError = /must be|cannot be/.test(raw)
        ? COPY.verdict.inputsClash
        : raw;
    }
  }

  const price = Number(s.price);
  const taxName = comps?.subject.country === 'W92000004' ? 'Land Transaction Tax' : 'Stamp Duty';

  // publish the headline for Save (S6.2)
  const headlineForSave = analysis ? `ROI ${fmtPct(analysis.roi.value)}` : '';
  // Snapshot published to the Save action. Built each render and used BOTH as the value
  // and (serialised) as the effect dep, so a change that moves the SCORE or the criteria
  // WITHOUT changing the headline string (e.g. a stress-rate tweak that flips the ICR gate)
  // still republishes — the saved score can never contradict what's on screen.
  const nextSnapshot = analysis
    ? { score: deal ? deal.score : null, headline: deal ? deal.headline : '', criteriaJson: JSON.stringify({ thresholds: requireThresholds(config), assumptions: p }), lever: analysis.lever ?? null, boardFigure: `${fmtMoney(analysis.cashflowAfterTax.value)}/mo` }
    : null;
  useEffect(() => {
    keyFigure.value = headlineForSave;
    verdictSnapshot.value = nextSnapshot;
  }, [headlineForSave, nextSnapshot ? `${nextSnapshot.score}|${nextSnapshot.boardFigure}|${nextSnapshot.headline}|${nextSnapshot.criteriaJson}|${nextSnapshot.lever}` : null]);

  return (
    <section class="glass card" aria-labelledby="verdict-h">
      <h2 id="verdict-h" tabIndex={-1}>{config.name} verdict</h2>
      <StrategyInputs visible={config.strategyInputs} assumptions={config.assumptions} />
      {!rentOk && <p class="hint">{COPY.verdict.needRent}</p>}
      {analysisError && <p class="field-error" role="alert">{analysisError}</p>}
      {/* (N4) The answer: on a desktop this becomes the sticky results rail
          beside the inputs; on a phone it is display:contents — no change. */}
      <div class="verdict-results">
      {deal && <DealScoreChip deal={deal} />}
      {analysis && (
        <>
          <div id="sec-verdict" class={`verdict-banner verdict-${analysis.verdict}`} role={stickyVerdictActive() ? undefined : 'status'}>
            <p class="verdict-line">{analysis.verdictCopy}</p>
            <BindingConstraintNote deal={deal} />
            {analysis.lever && <p class="verdict-lever">{analysis.lever}</p>}
            {valuation && price > 0 && (
              <p class="verdict-crosscheck">
                Asking {fmtMoney(price)} vs our estimate {fmtMoney(valuation.estimate)} ({fmtMoney(valuation.range.low)}–{fmtMoney(valuation.range.high)}).
                {price > valuation.range.high && ' Looks expensive vs sold evidence.'}
                {price < valuation.range.low && ' Below sold evidence — check why.'}
              </p>
            )}
          </div>
          <div class="tiles" id="sec-figures">
            <Tile label="ROI" value={fmtPct(analysis.roi.value)} breakdown={analysis.roi.breakdown} />
            <Tile label="Gross yield" value={fmtPct(analysis.grossYield.value)} breakdown={analysis.grossYield.breakdown} />
            <Tile label="Net yield" value={fmtPct(analysis.netYield.value)} breakdown={analysis.netYield.breakdown} />
            <Tile label="Cashflow after tax" value={`${fmtMoney(analysis.cashflowAfterTax.value)}/mo`} breakdown={analysis.cashflowAfterTax.breakdown} />
            <Tile id="sec-costs" label={`Cash in (incl. ${taxName})`} value={fmtMoney(analysis.cashIn.value)} breakdown={analysis.cashIn.breakdown}>
              <div class="bands">
                <p class="field-hint">{taxName}: {fmtMoney(analysis.stampDuty.value.tax)}</p>
                {analysis.stampDuty.value.bands.filter((b) => b.tax > 0).map((b) => (
                  <p class="field-hint">{fmtPct(b.rate * 100)} on {fmtMoney(b.slice)} = {fmtMoney(b.tax)}</p>
                ))}
              </div>
            </Tile>
            <Tile
              label={`Rent-covers-mortgage test (ICR ${Math.round(analysis.icr.threshold * 100)}%)`}
              value={`${fmtRatio(analysis.icr.value)} — ${analysis.icr.passes ? 'passes' : 'fails'}`}
              breakdown={analysis.icr.breakdown}
            />
            <Tile label="Tax on rental profit" value={`${fmtMoney(analysis.taxPerYear.value)}/yr`} breakdown={analysis.taxPerYear.breakdown} />
            <Tile label="Cashflow before tax" value={`${fmtMoney(analysis.cashflowBeforeTax.value)}/mo`} breakdown={analysis.cashflowBeforeTax.breakdown} />
          </div>
        </>
      )}
      </div>
    </section>
  );
}

function Tile({ id, label, value, breakdown, children }: {
  id?: string;
  label: string;
  value: string;
  breakdown: import('@gil-bricks/core').Breakdown;
  children?: preact.ComponentChildren;
}) {
  return (
    <div class="tile" id={id}>
      <p class="tile-label">{label}</p>
      <p class="tile-value">{value}</p>
      {children}
      <MathsAccordion breakdown={breakdown} />
    </div>
  );
}

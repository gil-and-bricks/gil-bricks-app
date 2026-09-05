/** The BTL verdict island — the ONLY BTL-specific code (the pattern for
 * S4.3–S4.5, see docs/STRATEGY_CONFIG_GUIDE.md). All maths comes from
 * @gil-bricks/core (strategy-calc/btl), which composes the canonical maths lib. */
import { keyFigure } from './keyFigure';
import { COPY } from '../../config/copy';
import { BTL_COPY, VERDICT_COPY } from '../../config/verdicts';
import { verdictSnapshot } from './verdictSnapshot';
import { useEffect } from 'preact/hooks';
import type { StrategyConfig } from '@gil-bricks/core';
import type { ComparablesResult } from '@gil-bricks/core';
import type { Valuation } from '@gil-bricks/core';
import { analyseBtl, scoreDeal, type BtlAnalysis, type BtlInputs, type DealScore } from '@gil-bricks/core';
import { DealScoreChip, BindingConstraintNote } from './DealScore';
import { leverIsRedundant } from './leverDedupe';
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
  const taxName = comps?.subject.country === 'W92000004' ? BTL_COPY.taxNames.wales : BTL_COPY.taxNames.england;

  // publish the headline for Save (S6.2)
  const headlineForSave = analysis ? BTL_COPY.savedHeadline(fmtPct(analysis.roi.value)) : '';
  // Snapshot published to the Save action. Built each render and used BOTH as the value
  // and (serialised) as the effect dep, so a change that moves the SCORE or the criteria
  // WITHOUT changing the headline string (e.g. a stress-rate tweak that flips the ICR gate)
  // still republishes — the saved score can never contradict what's on screen.
  const nextSnapshot = analysis
    ? { score: deal ? deal.score : null, headline: deal ? deal.headline : '', criteriaJson: JSON.stringify({ thresholds: requireThresholds(config), assumptions: p }), lever: analysis.lever ?? null, boardFigure: BTL_COPY.boardFigure(fmtMoney(analysis.cashflowAfterTax.value)) }
    : null;
  useEffect(() => {
    keyFigure.value = headlineForSave;
    verdictSnapshot.value = nextSnapshot;
  }, [headlineForSave, nextSnapshot ? `${nextSnapshot.score}|${nextSnapshot.boardFigure}|${nextSnapshot.headline}|${nextSnapshot.criteriaJson}|${nextSnapshot.lever}` : null]);

  return (
    <section class="glass card" aria-labelledby="verdict-h">
      <h2 id="verdict-h" tabIndex={-1}>{VERDICT_COPY.heading(config.name)}</h2>
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
            {!leverIsRedundant(analysis.lever, deal?.bindingConstraint?.plainExplanation) && <p class="verdict-lever">{analysis.lever}</p>}
            {valuation && price > 0 && (
              <p class="verdict-crosscheck">
                {BTL_COPY.crosscheck(fmtMoney(price), fmtMoney(valuation.estimate), fmtMoney(valuation.range.low), fmtMoney(valuation.range.high))}
                {price > valuation.range.high && BTL_COPY.crosscheckExpensive}
                {price < valuation.range.low && BTL_COPY.crosscheckCheap}
              </p>
            )}
          </div>
          <div class="tiles" id="sec-figures">
            <Tile label={BTL_COPY.tiles.roi} value={fmtPct(analysis.roi.value)} breakdown={analysis.roi.breakdown} />
            <Tile label={BTL_COPY.tiles.grossYield} value={fmtPct(analysis.grossYield.value)} breakdown={analysis.grossYield.breakdown} />
            <Tile label={BTL_COPY.tiles.netYield} value={fmtPct(analysis.netYield.value)} breakdown={analysis.netYield.breakdown} />
            <Tile label={BTL_COPY.tiles.cashflowAfterTax} value={`${fmtMoney(analysis.cashflowAfterTax.value)}${VERDICT_COPY.perMonth}`} breakdown={analysis.cashflowAfterTax.breakdown} />
            <Tile id="sec-costs" label={BTL_COPY.tiles.cashIn(taxName)} value={fmtMoney(analysis.cashIn.value)} breakdown={analysis.cashIn.breakdown}>
              <div class="bands">
                <p class="field-hint">{BTL_COPY.taxTotal(taxName, fmtMoney(analysis.stampDuty.value.tax))}</p>
                {analysis.stampDuty.value.bands.filter((b) => b.tax > 0).map((b) => (
                  <p class="field-hint">{BTL_COPY.taxBand(fmtPct(b.rate * 100), fmtMoney(b.slice), fmtMoney(b.tax))}</p>
                ))}
              </div>
            </Tile>
            <Tile
              label={VERDICT_COPY.icrLabel(Math.round(analysis.icr.threshold * 100))}
              value={VERDICT_COPY.icrResult(fmtRatio(analysis.icr.value), analysis.icr.passes ? VERDICT_COPY.icrPasses : VERDICT_COPY.icrFails)}
              breakdown={analysis.icr.breakdown}
            />
            <Tile label={BTL_COPY.tiles.taxPerYear} value={`${fmtMoney(analysis.taxPerYear.value)}${VERDICT_COPY.perYear}`} breakdown={analysis.taxPerYear.breakdown} />
            <Tile label={BTL_COPY.tiles.cashflowBeforeTax} value={`${fmtMoney(analysis.cashflowBeforeTax.value)}${VERDICT_COPY.perMonth}`} breakdown={analysis.cashflowBeforeTax.breakdown} />
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

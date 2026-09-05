/** The BRRRR verdict island — config + @gil-bricks/core (strategy-calc/brrrr) only. */
import { keyFigure } from './keyFigure';
import { COPY } from '../../config/copy';
import { BRRRR_COPY, VERDICT_COPY } from '../../config/verdicts';
import { verdictSnapshot } from './verdictSnapshot';
import { useEffect, useRef } from 'preact/hooks';
import type { StrategyConfig } from '@gil-bricks/core';
import type { ComparablesResult } from '@gil-bricks/core';
import type { Valuation } from '@gil-bricks/core';
import { analyseBrrrr, scoreDeal, type BrrrrAnalysis, type BrrrrStrategyInputs, type DealScore } from '@gil-bricks/core';
import { DealScoreChip, BindingConstraintNote } from './DealScore';
import { leverIsRedundant } from './leverDedupe';
import { features, stickyVerdictActive } from '../../config/features';
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
  let deal: DealScore | null = null;
  if (ready && comps) {
    try {
      const inputs: BrrrrStrategyInputs = {
        price: Number(s.price),
        country: comps.subject.country,
        refurb: num('refurbCost'),
        arv: num('arv'),
        funding: p.funding === 'cash' ? 'cash' : 'bridging',
        bridgeMonths: num('bridgeMonths'),
        monthlyRent: num('rent'),
        ltvPct,
        buyingAs: (p.buyingAs as 'basic' | 'higher' | 'ltd') ?? 'basic',
        selfManaged: p.mgmt === 'self',
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
      };
      analysis = analyseBrrrr(inputs);
      if (features.dealScore) {
        deal = scoreDeal('brrrr', inputs, valuation ? { estimate: valuation.estimate, high: valuation.range.high } : undefined);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      analysisError = /must be|cannot be/.test(raw)
        ? COPY.verdict.inputsClash
        : raw;
    }
  }

  const arv = num('arv');
  // publish the headline for Save (S6.2)
  const headlineForSave = analysis ? analysis.outcomeVerdict : '';
  // Snapshot published to the Save action. Built each render and used BOTH as the value
  // and (serialised) as the effect dep, so a change that moves the SCORE or the criteria
  // WITHOUT changing the headline string (e.g. a stress-rate tweak that flips the ICR gate)
  // still republishes — the saved score can never contradict what's on screen.
  const nextSnapshot = analysis
    ? { score: deal ? deal.score : null, headline: deal ? deal.headline : '', criteriaJson: JSON.stringify({ thresholds: requireThresholds(config), assumptions: p }), lever: analysis.lever ?? null, boardFigure: analysis.outcomeVerdict }
    : null;
  useEffect(() => {
    keyFigure.value = headlineForSave;
    verdictSnapshot.value = nextSnapshot;
  }, [headlineForSave, nextSnapshot ? `${nextSnapshot.score}|${nextSnapshot.boardFigure}|${nextSnapshot.headline}|${nextSnapshot.criteriaJson}|${nextSnapshot.lever}` : null]);

  return (
    <section class="glass card" aria-labelledby="verdict-h">
      <h2 id="verdict-h" tabIndex={-1}>{VERDICT_COPY.heading(config.name)}</h2>
      <StrategyInputs visible={config.strategyInputs} assumptions={config.assumptions} />
      {valuation && prefilled.current !== null && (strategyParams.value.arv ?? '') === prefilled.current && (
        <p class="field-hint">{COPY.verdict.prefilled}</p>
      )}
      {!ready && (
        <p class="hint">
          {p.ltv === 'custom' && num('ltvCustom') <= 0 ? COPY.verdict.needLtv : COPY.verdict.needBrrrr}
        </p>
      )}
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
            {valuation && arv > 0 && (
              <p class="verdict-crosscheck">
                {BRRRR_COPY.crosscheck(fmtMoney(arv), fmtMoney(valuation.estimate), fmtMoney(valuation.range.low), fmtMoney(valuation.range.high))}
                {arv > valuation.range.high && BRRRR_COPY.crosscheckAmbitious}
              </p>
            )}
          </div>
          <div class="tiles" id="sec-figures">
            <div class={`tile tile-hero${deal ? ` tier-${deal.verdict === 'good' ? 'good' : deal.verdict === 'marginal' ? 'marginal' : 'walk'}` : ''}`}>
              <p class="tile-label">{BRRRR_COPY.outcomeLabel}</p>
              <p class="tile-value">{analysis.outcomeVerdict}</p>
              <MathsAccordion breakdown={analysis.outcomeBreakdown} />
            </div>
            <Tile label={BRRRR_COPY.tiles.maxPriceAllOut}
              value={analysis.maxPriceAllOut !== null ? fmtMoney(analysis.maxPriceAllOut) : VERDICT_COPY.notReachable}
              breakdown={{
                label: BRRRR_COPY.maxPriceMaths.label, formula: BRRRR_COPY.maxPriceMaths.formula,
                substituted: BRRRR_COPY.maxPriceMaths.substituted(fmtMoney(arv), fmtPct(ltvPct)),
                result: analysis.maxPriceAllOut !== null ? fmtMoney(analysis.maxPriceAllOut) : BRRRR_COPY.maxPriceMaths.unreachable,
                note: BRRRR_COPY.maxPriceMaths.note,
              }} />
            <Tile label={BRRRR_COPY.tiles.arvNeededAllOut}
              value={analysis.arvNeededAllOut !== null ? fmtMoney(analysis.arvNeededAllOut) : VERDICT_COPY.notReachable}
              breakdown={{
                label: BRRRR_COPY.arvNeededMaths.label, formula: BRRRR_COPY.arvNeededMaths.formula,
                substituted: BRRRR_COPY.arvNeededMaths.substituted(fmtMoney(Number(s.price)), fmtPct(ltvPct)),
                result: analysis.arvNeededAllOut !== null ? fmtMoney(analysis.arvNeededAllOut) : BRRRR_COPY.arvNeededMaths.unreachable,
                note: BRRRR_COPY.arvNeededMaths.note,
              }} />
            <Tile label={BRRRR_COPY.tiles.refiLoan} value={fmtMoney(analysis.refiLoan.value)} breakdown={analysis.refiLoan.breakdown} />
            <Tile id="sec-costs" label={BRRRR_COPY.tiles.cashInvested} value={fmtMoney(analysis.cashInvested.value)} breakdown={analysis.cashInvested.breakdown} />
            {analysis.bridging && (
              <Tile label={BRRRR_COPY.tiles.bridging} value={fmtMoney(analysis.bridging.interest + analysis.bridging.arrangement + analysis.bridging.exit)} breakdown={analysis.bridging.breakdown} />
            )}
            <Tile label={BRRRR_COPY.tiles.cashflowAfterTax} value={`${fmtMoney(analysis.cashflowAfterTax.value)}${VERDICT_COPY.perMonth}`} breakdown={analysis.cashflowAfterTax.breakdown} />
            <Tile label={BRRRR_COPY.tiles.roiOnLeftIn}
              value={analysis.roiOnLeftIn.value !== null ? fmtPct(analysis.roiOnLeftIn.value) : BRRRR_COPY.infiniteReturn}
              breakdown={analysis.roiOnLeftIn.breakdown} />
            <Tile label={BRRRR_COPY.tiles.grossYieldOnCost} value={fmtPct(analysis.grossYieldOnCost.value)} breakdown={analysis.grossYieldOnCost.breakdown} />
            <Tile label={VERDICT_COPY.icrLabel(Math.round(analysis.icr.threshold * 100))}
              value={VERDICT_COPY.icrResult(fmtRatio(analysis.icr.value), analysis.icr.passes ? VERDICT_COPY.icrPasses : VERDICT_COPY.icrFails)}
              breakdown={analysis.icr.breakdown} />
          </div>
        </>
      )}
      </div>
    </section>
  );
}

function Tile({ id, label, value, breakdown }: {
  id?: string;
  label: string;
  value: string;
  breakdown: import('@gil-bricks/core').Breakdown;
}) {
  return (
    <div class="tile" id={id}>
      <p class="tile-label">{label}</p>
      <p class="tile-value">{value}</p>
      <MathsAccordion breakdown={breakdown} />
    </div>
  );
}

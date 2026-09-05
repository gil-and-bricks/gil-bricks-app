/** The Flip verdict island — config + @gil-bricks/core (strategy-calc/flip) only.
 * NO rental maths. ROI (after tax, selected scenario) leads. */
import { keyFigure } from './keyFigure';
import { COPY } from '../../config/copy';
import { FLIP_COPY, VERDICT_COPY } from '../../config/verdicts';
import { verdictSnapshot } from './verdictSnapshot';
import { useEffect, useRef } from 'preact/hooks';
import type { StrategyConfig } from '@gil-bricks/core';
import type { ComparablesResult } from '@gil-bricks/core';
import type { Valuation } from '@gil-bricks/core';
import { analyseFlip, scoreDeal, type FlipAnalysis, type FlipStrategyInputs, type DealScore } from '@gil-bricks/core';
import { SECTION_STRIP } from '../../config/analyserSections';
import { DealScoreChip, BindingConstraintNote } from './DealScore';
import { leverIsRedundant } from './leverDedupe';
import { features, stickyVerdictActive } from '../../config/features';
import type { BuyerType } from '@gil-bricks/core';
import { fmtMoney, fmtPct } from '@gil-bricks/core';
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
  let deal: DealScore | null = null;
  if (ready && comps) {
    try {
      const inputs: FlipStrategyInputs = {
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
      };
      analysis = analyseFlip(inputs);
      if (features.dealScore) {
        deal = scoreDeal('flip', inputs, valuation ? { estimate: valuation.estimate, high: valuation.range.high } : undefined);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      analysisError = /must be|cannot be/.test(raw)
        ? COPY.verdict.inputsClash
        : raw;
    }
  }

  const gdv = num('gdv');
  // publish the headline for Save (S6.2)
  const headlineForSave = analysis ? FLIP_COPY.savedHeadline(fmtMoney(analysis.profitAfterTax.value)) : '';
  // Snapshot published to the Save action. Built each render and used BOTH as the value
  // and (serialised) as the effect dep, so a change that moves the SCORE or the criteria
  // WITHOUT changing the headline string (e.g. a stress-rate tweak that flips the ICR gate)
  // still republishes — the saved score can never contradict what's on screen.
  const nextSnapshot = analysis
    ? { score: deal ? deal.score : null, headline: deal ? deal.headline : '', criteriaJson: JSON.stringify({ thresholds: requireThresholds(config), assumptions: p }), lever: analysis.lever ?? null, boardFigure: FLIP_COPY.boardFigure(fmtMoney(analysis.profitAfterTax.value)) }
    : null;
  useEffect(() => {
    keyFigure.value = headlineForSave;
    verdictSnapshot.value = nextSnapshot;
  }, [headlineForSave, nextSnapshot ? `${nextSnapshot.score}|${nextSnapshot.boardFigure}|${nextSnapshot.headline}|${nextSnapshot.criteriaJson}|${nextSnapshot.lever}` : null]);

  return (
    <section class="glass card" aria-labelledby="verdict-h">
      <h2 id="verdict-h" tabIndex={-1}>{VERDICT_COPY.heading(config.name)}</h2>
      <StrategyInputs visible={config.strategyInputs} assumptions={config.assumptions} />
      {valuation && prefilled.current !== null && !diverged.current && (strategyParams.value.gdv ?? '') === prefilled.current && (
        <p class="field-hint">{COPY.verdict.prefilled}</p>
      )}
      {isLtd && <p class="field-hint">{COPY.verdict.companyTax}</p>}
      {!ready && <p class="hint">{COPY.verdict.needFlip}</p>}
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
            {valuation && gdv > 0 && (
              <p class="verdict-crosscheck">
                {FLIP_COPY.crosscheck(fmtMoney(gdv), fmtMoney(valuation.estimate), fmtMoney(valuation.range.low), fmtMoney(valuation.range.high))}
                {gdv > valuation.range.high && FLIP_COPY.crosscheckAmbitious}
              </p>
            )}
          </div>
          <p class="hint">{COPY.verdict.flipTax}</p>
          <div class="tiles" id="sec-figures">
            <div class={`tile tile-hero${deal ? ` tier-${deal.verdict === 'good' ? 'good' : deal.verdict === 'marginal' ? 'marginal' : 'walk'}` : ''}`}>
              <p class="tile-label">{FLIP_COPY.heroLabel(isLtd ? FLIP_COPY.scenarioCompany : FLIP_COPY.scenarioPersonal)}</p>
              <p class="tile-value">{fmtPct(analysis.roiAfterTax.value)}</p>
              <p class="field-hint">{FLIP_COPY.beforeTax(fmtPct(analysis.roiBeforeTax.value))}</p>
              <MathsAccordion breakdown={analysis.roiAfterTax.breakdown} label={SECTION_STRIP.mathsFor(analysis.roiAfterTax.breakdown.label.toLowerCase())} />
              <MathsAccordion breakdown={analysis.roiBeforeTax.breakdown} label={SECTION_STRIP.mathsFor(analysis.roiBeforeTax.breakdown.label.toLowerCase())} />
            </div>
            <Tile label={FLIP_COPY.tiles.profitBeforeTax} value={fmtMoney(analysis.profitBeforeTax.value)} breakdown={analysis.profitBeforeTax.breakdown} />
            <div class="tile">
              <p class="tile-label">{FLIP_COPY.tiles.taxOnProfit}</p>
              <div class="tax-compare">
                <div class={!isLtd ? 'tax-col tax-selected' : 'tax-col'}>
                  <p class="tile-label">{FLIP_COPY.tiles.personally}</p>
                  <p class="tile-value">{fmtMoney(analysis.personalTax.value)}</p>
                  <MathsAccordion breakdown={analysis.personalTax.breakdown} />
                </div>
                <div class={isLtd ? 'tax-col tax-selected' : 'tax-col'}>
                  <p class="tile-label">{FLIP_COPY.tiles.company}</p>
                  <p class="tile-value">{fmtMoney(analysis.companyTax.value)}</p>
                  <MathsAccordion breakdown={analysis.companyTax.breakdown} />
                  <p class="field-hint">{FLIP_COPY.companyDrawdown}</p>
                </div>
              </div>
            </div>
            <Tile label={FLIP_COPY.tiles.profitAfterTax} value={fmtMoney(analysis.profitAfterTax.value)} breakdown={analysis.profitAfterTax.breakdown} />
            <Tile id="sec-costs" label={FLIP_COPY.tiles.totalCostIn} value={fmtMoney(analysis.totalCostIn.value)} breakdown={analysis.totalCostIn.breakdown} />
            <Tile label={FLIP_COPY.tiles.cashInvested} value={fmtMoney(analysis.cashInvested.value)} breakdown={analysis.cashInvested.breakdown} />
            {analysis.financeCosts && (
              <Tile label={FLIP_COPY.tiles.financeCosts} value={fmtMoney(analysis.financeCosts.value)} breakdown={analysis.financeCosts.breakdown} />
            )}
            <Tile label={FLIP_COPY.tiles.maxOfferGreen}
              value={analysis.maxOfferGreen !== null ? fmtMoney(analysis.maxOfferGreen) : VERDICT_COPY.notReachable}
              breakdown={{
                label: FLIP_COPY.maxOfferMaths.label, formula: FLIP_COPY.maxOfferMaths.formula,
                substituted: FLIP_COPY.maxOfferMaths.substituted(fmtMoney(gdv)),
                result: analysis.maxOfferGreen !== null ? fmtMoney(analysis.maxOfferGreen) : FLIP_COPY.maxOfferMaths.unreachable,
                note: FLIP_COPY.maxOfferMaths.note,
              }} />
            <Tile label={FLIP_COPY.tiles.gdvNeededGreen}
              value={analysis.gdvNeededGreen !== null ? fmtMoney(analysis.gdvNeededGreen) : VERDICT_COPY.notReachable}
              breakdown={{
                label: FLIP_COPY.gdvNeededMaths.label, formula: FLIP_COPY.gdvNeededMaths.formula,
                substituted: FLIP_COPY.gdvNeededMaths.substituted(fmtMoney(Number(s.price))),
                result: analysis.gdvNeededGreen !== null ? fmtMoney(analysis.gdvNeededGreen) : FLIP_COPY.gdvNeededMaths.unreachable,
                note: FLIP_COPY.gdvNeededMaths.note,
              }} />
            {config.flags?.showGdvModule && (
              <GdvModule pct={analysis.profitOnGdvPct.value} breakdown={analysis.profitOnGdvPct.breakdown} />
            )}
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

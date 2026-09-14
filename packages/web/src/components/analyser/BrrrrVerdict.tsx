/** The BRRRR verdict island — config + @gil-bricks/core (strategy-calc/brrrr) only. */
import { keyFigure } from './keyFigure';
import { COPY } from '../../config/copy';
import { BRRRR_COPY, VERDICT_COPY } from '../../config/verdicts';
import { evidenceFromComps } from './soldEvidence';
import { hasArrivedCriteria, judgedBy } from './criteria';
import { verdictSnapshot } from './verdictSnapshot';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { StrategyConfig } from '@gil-bricks/core';
import type { ComparablesResult } from '@gil-bricks/core';
import type { Valuation } from '@gil-bricks/core';
import { analyseBrrrr, scoreDeal, type BrrrrAnalysis, type BrrrrStrategyInputs, type DealScore , missingForVerdict } from '@gil-bricks/core';
import { StampDutyCost } from './StampDutyCost';
import { DealScoreChip, BindingConstraintNote } from './DealScore';
import { analyserEvidence } from './analyserEvidence';
import { leverIsRedundant } from './leverDedupe';
import { features, stickyVerdictActive } from '../../config/features';
import type { BuyerType } from '@gil-bricks/core';
import { fmtMoney, fmtPct, fmtRatio } from '@gil-bricks/core';
import { initStrategyParams, state, strategyParams, updateStrategy, legacyRefurbLevel } from './state';
import { refurbParamKeys } from './RefurbSection';
import { VerdictShell } from './VerdictShell';
import { AreaTrajectoryPanel } from './AreaTrajectory';
import { MathsAccordion } from './Accordion';

function requireThresholds(config: StrategyConfig): { allOutMax: number; minCashflowGreen: number; icrBasic: number; icrHigher: number } {
  const t = config.thresholds;
  for (const k of ['allOutMax', 'minCashflowGreen', 'icrBasic', 'icrHigher']) {
    if (typeof t[k] !== 'number') throw new Error(`Strategy config is missing its "${k}" verdict threshold`);
  }
  return t as { allOutMax: number; minCashflowGreen: number; icrBasic: number; icrHigher: number };
}

export function BrrrrVerdict({ config, comps, valuation, beforeVerdict }: {
  config: StrategyConfig;
  comps: ComparablesResult | null;
  valuation: Valuation | null;
  /** L1 — the floor plan, rendered between refurb and the verdict. */
  beforeVerdict?: ComponentChildren;
}) {
  const fields = [...config.strategyInputs, ...config.assumptions];
  useEffect(() => {
    // R1: the refurb rows are params too, so a saved deal and a shared link
    // carry the itemised list exactly as they carry every other input.
    initStrategyParams([
      ...fields,
      ...(features.refurbSection ? refurbParamKeys().map((key) => ({ key, kind: 'number' as const, default: '' })) : []),
    ]);
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
  const needs = missingForVerdict(config, strategyParams.value);
  const ready = needs.length === 0 && Number(s.price) > 0 && ltvPct > 0;

  let analysis: BrrrrAnalysis | null = null;
  let analysisError: string | null = null;
  // The sold-price band the score rests on — the sector's own distribution,
  // read by the SAME rule the extension panel uses (D4). The valuation below
  // is a display figure and deliberately plays no part in it.
  const soldEvidence = evidenceFromComps(num('arv'), comps);
  // D4 — the bar this is judged by: the person's own minimums when they came
  // over from the panel, the strategy's own otherwise. customKeys is what makes
  // the engine say "you set as your minimum" instead of claiming it as ours.
  const judged = judgedBy('brrrr', requireThresholds(config) as unknown as Record<string, number>);
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
        thresholds: judged.thresholds as never,
      };
      analysis = analyseBrrrr(inputs);
      if (features.dealScore) {
        deal = scoreDeal('brrrr', inputs, soldEvidence, { customKeys: judged.customKeys });
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
    ? { soldEvidence: soldEvidence ?? null, score: deal ? deal.score : null, headline: deal ? deal.headline : '', criteriaJson: JSON.stringify({ thresholds: judged.thresholds, assumptions: p }), lever: analysis.lever ?? null, boardFigure: analysis.outcomeVerdict }
    : null;
  useEffect(() => {
    keyFigure.value = headlineForSave;
    verdictSnapshot.value = nextSnapshot;
  }, [headlineForSave, nextSnapshot ? `${nextSnapshot.score}|${nextSnapshot.boardFigure}|${nextSnapshot.headline}|${nextSnapshot.criteriaJson}|${nextSnapshot.lever}|${nextSnapshot.soldEvidence?.estimate ?? ''}` : null]);

  return (
    <VerdictShell
      config={config}
      country={comps?.subject.country ?? null}
      hasContingency={fields.some((f) => f.key === 'contingencyPct')}
      beforeVerdict={beforeVerdict}
      missing={needs}
      /* CA1 — history and labelled assumptions, collapsed, inside the verdict
         card but never part of the verdict. Not an input to the Deal Score. */
      afterVerdict={features.areaTrajectory
        ? <AreaTrajectoryPanel sector={comps?.subject.sectorId ?? null} price={Number(s.price) || null} />
        : null}
    >
      {valuation && prefilled.current !== null && (strategyParams.value.arv ?? '') === prefilled.current && (
        <p class="field-hint">{COPY.verdict.prefilled}</p>
      )}
      {/* The shell says which field the verdict is waiting for. This one stays
          because it is a DIFFERENT condition: a custom LTV chosen and left blank. */}
      {p.ltv === 'custom' && num('ltvCustom') <= 0 && (
        <p class="hint">{COPY.verdict.needLtv}</p>
      )}
      {analysisError && <p class="field-error" role="alert">{analysisError}</p>}
      {/* (N4) The answer: on a desktop this becomes the sticky results rail
          beside the inputs; on a phone it is display:contents — no change. */}
      <div class="verdict-results">
      {deal && <DealScoreChip deal={deal} strategy="brrrr" evidence={analyserEvidence(soldEvidence !== undefined, null, 'brrrr')} />}
      {hasArrivedCriteria(config.id) && <p class="hint judged-by">{VERDICT_COPY.judgedByYours}</p>}
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
            {features.stampDutyCost && <StampDutyCost id="sec-costs" sdlt={analysis.stampDuty} viaCompany={p.buyingAs === 'ltd'} />}
            <Tile id={features.stampDutyCost ? undefined : 'sec-costs'} label={BRRRR_COPY.tiles.cashInvested} value={fmtMoney(analysis.cashInvested.value)} breakdown={analysis.cashInvested.breakdown} />
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
    </VerdictShell>
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

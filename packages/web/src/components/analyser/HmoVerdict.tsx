/** The small-HMO verdict island — config + @gil-bricks/core (strategy-calc/hmo) only.
 * BRICKS-AND-MORTAR valuation only; no commercial valuation anywhere. */
import { keyFigure } from './keyFigure';
import { COPY } from '../../config/copy';
import { HMO_COPY, VERDICT_COPY } from '../../config/verdicts';
import { verdictSnapshot } from './verdictSnapshot';
import { useEffect, useState } from 'preact/hooks';
import type { StrategyConfig } from '@gil-bricks/core';
import type { ComparablesResult } from '@gil-bricks/core';
import type { Valuation } from '@gil-bricks/core';
import { analyseHmo, checkRoomSizes, scoreDeal, type HmoAnalysis, type HmoInputs, type RoomOccupancy, type DealScore } from '@gil-bricks/core';
import { DealScoreChip, BindingConstraintNote } from './DealScore';
import { leverIsRedundant } from './leverDedupe';
import { features, stickyVerdictActive } from '../../config/features';
import type { BuyerType } from '@gil-bricks/core';
import { fmtMoney, fmtPct, fmtRatio } from '@gil-bricks/core';
import { initStrategyParams, state, strategyParams } from './state';
import { StrategyInputs } from './StrategyInputs';
import { Accordion, MathsAccordion } from './Accordion';
import { Article4Flag } from './Article4Flag';

function requireThresholds(config: StrategyConfig): { minCashflowGreen: number; minRoiGreen: number; icrBasic: number; icrHigher: number } {
  const t = config.thresholds;
  for (const k of ['minCashflowGreen', 'minRoiGreen', 'icrBasic', 'icrHigher']) {
    if (typeof t[k] !== 'number') throw new Error(`Strategy config is missing its "${k}" verdict threshold`);
  }
  return t as { minCashflowGreen: number; minRoiGreen: number; icrBasic: number; icrHigher: number };
}

interface RoomRow {
  sqm: string;
  occupancy: RoomOccupancy;
}

export function HmoVerdict({ config, comps, valuation }: {
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

  // Room-size checker (local, optional — failures cap the verdict at amber)
  const [rows, setRows] = useState<RoomRow[]>([]);
  const roomsSel = p.rooms ?? '4';
  const isSuiGeneris = roomsSel === '7plus';
  const roomCount = isSuiGeneris ? 0 : Number(roomsSel);
  const enteredRooms = rows.slice(0, roomCount).filter((r) => r.sqm !== '');
  const checks = checkRoomSizes(
    enteredRooms.map((r) => ({ sqm: Number(r.sqm), occupancy: r.occupancy })),
  );
  const failures = checks.filter((c) => !c.ok).length;
  // Coverage-gate the all-clear: a measured failure is always authoritative, but
  // an all-pass (0) only clears once EVERY assumed room has been entered — a partial
  // or empty accordion stays UNVERIFIED (null), never a false "the room sizes are
  // legal" green (E9.1 review; mirrors the extension's scoreListing gate).
  const roomSizeFailures = failures > 0 ? failures : enteredRooms.length >= roomCount ? 0 : null;

  const selfManaged = p.mgmt === 'self';
  const ready = !isSuiGeneris && num('roomRent') > 0 && Number(s.price) > 0;

  let analysis: HmoAnalysis | null = null;
  let analysisError: string | null = null;
  let deal: DealScore | null = null;
  if (ready && comps) {
    try {
      const inputs: HmoInputs = {
        price: Number(s.price),
        country: comps.subject.country,
        rooms: roomCount,
        roomRent: num('roomRent'),
        billsIncluded: p.bills !== 'no',
        refurb: num('refurbCost'),
        buyingAs: (p.buyingAs as 'basic' | 'higher' | 'ltd') ?? 'basic',
        selfManaged,
        depositPct: num('deposit'),
        ratePct: num('rate'),
        opCostPct: selfManaged ? num('opCostPctSelf') : num('opCostPctAgent'),
        licenceFee: num('licenceFee'),
        licenceYears: 5,
        compliancePerYear: num('compliancePerYear'),
        legals: num('legals'),
        stressRatePct: num('stressRate'),
        taxBasis: (p.taxBasis as BuyerType) ?? 'additional',
        roomSizeFailures,
        thresholds: requireThresholds(config),
      };
      analysis = analyseHmo(inputs);
      if (features.dealScore) {
        deal = scoreDeal('hmo', inputs, valuation ? { estimate: valuation.estimate, high: valuation.range.high } : undefined);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      analysisError = /must be|cannot be/.test(raw)
        ? COPY.verdict.inputsClash
        : raw;
    }
  }

  const price = Number(s.price);
  // publish the headline for Save (S6.2)
  const headlineForSave = analysis ? HMO_COPY.savedHeadline(fmtPct(analysis.roi.value)) : '';
  // Snapshot published to the Save action. Built each render and used BOTH as the value
  // and (serialised) as the effect dep, so a change that moves the SCORE or the criteria
  // WITHOUT changing the headline string (e.g. a stress-rate tweak that flips the ICR gate)
  // still republishes — the saved score can never contradict what's on screen.
  const nextSnapshot = analysis
    ? { score: deal ? deal.score : null, headline: deal ? deal.headline : '', criteriaJson: JSON.stringify({ thresholds: requireThresholds(config), assumptions: p }), lever: analysis.lever ?? null, boardFigure: HMO_COPY.savedHeadline(fmtPct(analysis.roi.value)) }
    : null;
  useEffect(() => {
    keyFigure.value = headlineForSave;
    verdictSnapshot.value = nextSnapshot;
  }, [headlineForSave, nextSnapshot ? `${nextSnapshot.score}|${nextSnapshot.boardFigure}|${nextSnapshot.headline}|${nextSnapshot.criteriaJson}|${nextSnapshot.lever}` : null]);

  return (
    <section class="glass card" aria-labelledby="verdict-h">
      <h2 id="verdict-h" tabIndex={-1}>{VERDICT_COPY.heading(config.name)}</h2>
      <p class="hint">{COPY.verdict.hmoScope}</p>
      <StrategyInputs visible={config.strategyInputs} assumptions={config.assumptions} />
      {comps && <Article4Flag lat={comps.subject.lat} lng={comps.subject.lng} country={comps.subject.country} />}
      {isSuiGeneris && (
        <p class="field-error" role="alert">{COPY.verdict.hmoSuiGeneris}</p>
      )}
      {!isSuiGeneris && p.bills === 'no' && (
        <p class="field-hint">{COPY.verdict.hmoBills}</p>
      )}
      {!isSuiGeneris && !ready && <p class="hint">{COPY.verdict.needRoomRent}</p>}
      {analysisError && <p class="field-error" role="alert">{analysisError}</p>}

      {!isSuiGeneris && (
        <div class="assumptions">
          <Accordion label={HMO_COPY.roomSizes.heading}>
            <p class="field-hint">{HMO_COPY.roomSizes.body}</p>
            {Array.from({ length: roomCount }, (_, idx) => {
              const row = rows[idx] ?? { sqm: '', occupancy: 'single' as RoomOccupancy };
              const check = row.sqm !== '' ? checkRoomSizes([{ sqm: Number(row.sqm), occupancy: row.occupancy }])[0] : null;
              return (
                <div class="room-row">
                  <label>
                    {HMO_COPY.roomSizes.roomLabel(idx + 1)}
                    <input inputMode="decimal" value={row.sqm}
                      onInput={(e) => {
                        const next = [...rows];
                        next[idx] = { ...row, sqm: (e.target as HTMLInputElement).value.replace(/[^0-9.]/g, '') };
                        setRows(next);
                      }} />
                  </label>
                  <label>
                    {HMO_COPY.roomSizes.occupancyLabel}
                    <select value={row.occupancy} onChange={(e) => {
                      const next = [...rows];
                      next[idx] = { ...row, occupancy: (e.target as HTMLSelectElement).value as RoomOccupancy };
                      setRows(next);
                    }}>
                      <option value="single">{HMO_COPY.roomSizes.occupancy.single}</option>
                      <option value="double">{HMO_COPY.roomSizes.occupancy.double}</option>
                      <option value="child">{HMO_COPY.roomSizes.occupancy.child}</option>
                    </select>
                  </label>
                  {check && <span class={check.ok ? 'room-ok' : 'room-fail'}>{check.ok ? HMO_COPY.roomSizes.pass : HMO_COPY.roomSizes.fail(check.message)}</span>}
                </div>
              );
            })}
          </Accordion>
        </div>
      )}

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
                {HMO_COPY.crosscheck(fmtMoney(price), fmtMoney(valuation.estimate), fmtMoney(valuation.range.low), fmtMoney(valuation.range.high))}
                {price > valuation.range.high && HMO_COPY.crosscheckExpensive}
              </p>
            )}
          </div>

          <div class={`licence-flag licence-${analysis.licence.level}`} role="note">
            <p>{analysis.licence.copy}</p>
            <p class="field-hint">{COPY.verdict.hmoRegister}</p>
          </div>

          <Accordion label={HMO_COPY.planning.heading}>
            <p class="field-hint">{HMO_COPY.planning.body}</p>
          </Accordion>

          <div class="tiles" id="sec-figures">
            <div class={`tile tile-hero${deal ? ` tier-${deal.verdict === 'good' ? 'good' : deal.verdict === 'marginal' ? 'marginal' : 'walk'}` : ''}`}>
              <p class="tile-label">{HMO_COPY.tiles.roi}</p>
              <p class="tile-value">{fmtPct(analysis.roi.value)}</p>
              <MathsAccordion breakdown={analysis.roi.breakdown} />
            </div>
            <Tile label={HMO_COPY.tiles.cashflowAfterTax} value={`${fmtMoney(analysis.cashflowAfterTax.value)}${VERDICT_COPY.perMonth}`} breakdown={analysis.cashflowAfterTax.breakdown} />
            <Tile label={HMO_COPY.tiles.grossIncome} value={`${fmtMoney(analysis.grossIncome.value)}${VERDICT_COPY.perYear}`} breakdown={analysis.grossIncome.breakdown} />
            <Tile id="sec-costs" label={HMO_COPY.tiles.operatingCosts} value={`${fmtMoney(analysis.operatingCosts.value)}${VERDICT_COPY.perYear}`} breakdown={analysis.operatingCosts.breakdown} />
            <Tile label={HMO_COPY.tiles.noi} value={`${fmtMoney(analysis.noi.value)}${VERDICT_COPY.perYear}`} breakdown={analysis.noi.breakdown} />
            <Tile label={HMO_COPY.tiles.grossYield} value={fmtPct(analysis.grossYield.value)} breakdown={analysis.grossYield.breakdown} />
            <Tile label={HMO_COPY.tiles.netYield} value={fmtPct(analysis.netYield.value)} breakdown={analysis.netYield.breakdown} />
            <Tile label={HMO_COPY.tiles.cashIn} value={fmtMoney(analysis.cashIn.value)} breakdown={analysis.cashIn.breakdown} />
            <Tile label={VERDICT_COPY.icrLabel(Math.round(analysis.icr.threshold * 100))}
              value={VERDICT_COPY.icrResult(fmtRatio(analysis.icr.value), analysis.icr.passes ? VERDICT_COPY.icrPasses : VERDICT_COPY.icrFails)}
              breakdown={analysis.icr.breakdown} />
            <Tile label={HMO_COPY.tiles.taxPerYear} value={`${fmtMoney(analysis.taxPerYear.value)}${VERDICT_COPY.perYear}`} breakdown={analysis.taxPerYear.breakdown} />
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

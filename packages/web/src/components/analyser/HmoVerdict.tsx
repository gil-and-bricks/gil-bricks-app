/** The small-HMO verdict island — config + @gil-bricks/core (strategy-calc/hmo) only.
 * BRICKS-AND-MORTAR valuation only; no commercial valuation anywhere. */
import { keyFigure } from './keyFigure';
import { useEffect, useState } from 'preact/hooks';
import type { StrategyConfig } from '@gil-bricks/core';
import type { ComparablesResult } from '@gil-bricks/core';
import type { Valuation } from '@gil-bricks/core';
import { analyseHmo, checkRoomSizes, scoreDeal, type HmoAnalysis, type HmoInputs, type RoomOccupancy, type DealScore } from '@gil-bricks/core';
import { DealScoreChip, BindingConstraintNote } from './DealScore';
import { siteConfig } from '../../site.config';
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
  const checks = checkRoomSizes(
    rows.slice(0, roomCount).filter((r) => r.sqm !== '').map((r) => ({ sqm: Number(r.sqm), occupancy: r.occupancy })),
  );
  const failures = checks.filter((c) => !c.ok).length;

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
        roomSizeFailures: failures,
        thresholds: requireThresholds(config),
      };
      analysis = analyseHmo(inputs);
      if (siteConfig.features.dealScore) {
        deal = scoreDeal('hmo', inputs, valuation ? { estimate: valuation.estimate, high: valuation.range.high } : undefined);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      analysisError = /must be|cannot be/.test(raw)
        ? 'These numbers don’t work together — check the price, rooms and rent values.'
        : raw;
    }
  }

  const price = Number(s.price);
  // publish the headline for Save (S6.2)
  const headlineForSave = analysis ? `ROI ${fmtPct(analysis.roi.value)}` : '';
  useEffect(() => {
    keyFigure.value = headlineForSave;
  }, [headlineForSave]);

  return (
    <section class="glass card" aria-labelledby="verdict-h">
      <h2 id="verdict-h">{config.name} verdict</h2>
      <p class="hint">
        This works out the bricks-and-mortar value and room-by-room cashflow for small HMOs (up to 6 people).
        It does not estimate a commercial HMO valuation — those need a surveyor.
      </p>
      <StrategyInputs visible={config.strategyInputs} assumptions={config.assumptions} />
      {comps && <Article4Flag lat={comps.subject.lat} lng={comps.subject.lng} country={comps.subject.country} />}
      {isSuiGeneris && (
        <p class="field-error" role="alert">
          7 or more people is a large ‘sui generis’ HMO — outside what this tool covers.
        </p>
      )}
      {!isSuiGeneris && p.bills === 'no' && (
        <p class="field-hint">
          Tenants paying their own bills usually cuts your operating costs — lower the operating % in
          the assumptions to match.
        </p>
      )}
      {!isSuiGeneris && !ready && <p class="hint">Add the rent per room to get a verdict.</p>}
      {analysisError && <p class="field-error" role="alert">{analysisError}</p>}

      {!isSuiGeneris && (
        <div class="assumptions">
          <Accordion label="Check your room sizes are legal">
            <p class="field-hint">
              Statutory minimums for licensed HMOs in England: 6.51 sqm for one adult, 10.22 sqm for two,
              4.64 sqm for a child under 10 — under 4.64 sqm cannot be a bedroom at all.
              Councils can require larger — always check locally.
            </p>
            {Array.from({ length: roomCount }, (_, idx) => {
              const row = rows[idx] ?? { sqm: '', occupancy: 'single' as RoomOccupancy };
              const check = row.sqm !== '' ? checkRoomSizes([{ sqm: Number(row.sqm), occupancy: row.occupancy }])[0] : null;
              return (
                <div class="room-row">
                  <label>
                    Room {idx + 1} (sqm)
                    <input inputMode="decimal" value={row.sqm}
                      onInput={(e) => {
                        const next = [...rows];
                        next[idx] = { ...row, sqm: (e.target as HTMLInputElement).value.replace(/[^0-9.]/g, '') };
                        setRows(next);
                      }} />
                  </label>
                  <label>
                    Sleeps
                    <select value={row.occupancy} onChange={(e) => {
                      const next = [...rows];
                      next[idx] = { ...row, occupancy: (e.target as HTMLSelectElement).value as RoomOccupancy };
                      setRows(next);
                    }}>
                      <option value="single">One adult</option>
                      <option value="double">Two adults</option>
                      <option value="child">Child under 10</option>
                    </select>
                  </label>
                  {check && <span class={check.ok ? 'room-ok' : 'room-fail'}>{check.ok ? '✓ legal' : `✗ ${check.message}`}</span>}
                </div>
              );
            })}
          </Accordion>
        </div>
      )}

      {deal && <DealScoreChip deal={deal} />}
      {analysis && (
        <>
          <div class={`verdict-banner verdict-${analysis.verdict}`} role="status">
            <p class="verdict-line">{analysis.verdictCopy}</p>
            <BindingConstraintNote deal={deal} />
            {analysis.lever && <p class="verdict-lever">{analysis.lever}</p>}
            {valuation && price > 0 && (
              <p class="verdict-crosscheck">
                Purchase {fmtMoney(price)} vs bricks-and-mortar estimate {fmtMoney(valuation.estimate)} ({fmtMoney(valuation.range.low)}–{fmtMoney(valuation.range.high)}).
                {price > valuation.range.high && ' Looks expensive vs sold evidence.'}
              </p>
            )}
          </div>

          <div class={`licence-flag licence-${analysis.licence.level}`} role="note">
            <p>{analysis.licence.copy}</p>
            <p class="field-hint">
              To check if a property is a licensed HMO, find your council at gov.uk/find-local-council and
              search its site for ‘HMO register’.
            </p>
          </div>

          <Accordion label="Planning: do I need permission?">
            <p class="field-hint">
              Turning an ordinary house (class C3) into a small HMO (class C4, 3–6 people) is usually
              ‘permitted development’ — no planning application. But where the council has made an
              Article 4 direction, full planning permission is needed. 7 or more people is always
              ‘sui generis’ and needs permission everywhere.
            </p>
          </Accordion>

          <div class="tiles">
            <div class="tile tile-hero">
              <p class="tile-label">Return on investment</p>
              <p class="tile-value">{fmtPct(analysis.roi.value)}</p>
              <MathsAccordion breakdown={analysis.roi.breakdown} />
            </div>
            <Tile label="Cashflow after tax" value={`${fmtMoney(analysis.cashflowAfterTax.value)}/mo`} breakdown={analysis.cashflowAfterTax.breakdown} />
            <Tile label="Gross room income" value={`${fmtMoney(analysis.grossIncome.value)}/yr`} breakdown={analysis.grossIncome.breakdown} />
            <Tile label="Operating costs" value={`${fmtMoney(analysis.operatingCosts.value)}/yr`} breakdown={analysis.operatingCosts.breakdown} />
            <Tile label="Net operating income" value={`${fmtMoney(analysis.noi.value)}/yr`} breakdown={analysis.noi.breakdown} />
            <Tile label="Gross yield" value={fmtPct(analysis.grossYield.value)} breakdown={analysis.grossYield.breakdown} />
            <Tile label="Net yield" value={fmtPct(analysis.netYield.value)} breakdown={analysis.netYield.breakdown} />
            <Tile label="Cash in" value={fmtMoney(analysis.cashIn.value)} breakdown={analysis.cashIn.breakdown} />
            <Tile label={`Rent-covers-mortgage test (ICR ${Math.round(analysis.icr.threshold * 100)}%)`}
              value={`${fmtRatio(analysis.icr.value)} — ${analysis.icr.passes ? 'passes' : 'fails'}`}
              breakdown={analysis.icr.breakdown} />
            <Tile label="Tax on the rooms" value={`${fmtMoney(analysis.taxPerYear.value)}/yr`} breakdown={analysis.taxPerYear.breakdown} />
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

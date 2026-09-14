/**
 * CA1 — THE AREA TRAJECTORY PANEL.
 *
 * One collapsed line inside the verdict card. Closed, it is a single row saying
 * what it is and what it is not. It never interrupts working through the
 * analyser, and it never reads as part of the answer above it.
 *
 * THREE RULES THIS FILE KEEPS, and each is enforced somewhere:
 *
 *  1. IT COMPUTES NOTHING. Every figure comes from `trajectoryFor` in
 *     @gil-bricks/core. This file formats and lays out; the reversibility
 *     charter forbids a component doing domain arithmetic, and the ratchet
 *     counts it.
 *  2. IT HOLDS NO COPY. Every word is in src/config/areaTrajectory.ts. A new
 *     component is held to ZERO inline strings.
 *  3. IT NEVER READS AS A FORECAST. The honest sentence sits with the numbers,
 *     every band carries its assumption, and a test fails on the words
 *     forecast, predict, projected, projection, expected and will be.
 *
 * IT IS NOT AN INPUT TO THE DEAL SCORE. Nothing here is passed to `scoreDeal`,
 * and `areaTrajectoryScore.test.ts` asserts the score is byte-identical with
 * this panel on and off.
 *
 * LAZY BY DESIGN. The two data files are fetched the first time the panel is
 * opened, never on page load — a reader who never opens it pays nothing.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  HORIZONS,
  MIN_TRANSACTIONS,
  codesForSector,
  fmtMoney,
  getAreaCodes,
  getAreaTrajectory,
  bandEnds,
  historyPoints,
  trajectoryFor,
  type AreaFacts,
  type AreaTrajectory as Trajectory,
  type Horizon,
} from '@gil-bricks/core';
import { AREA_TRAJECTORY as C } from '../../config/areaTrajectory';
import { MathsAccordion } from './Accordion';

type Load = 'idle' | 'loading' | 'failed';

/** A rate as a signed percentage, to one decimal. Formatting, not arithmetic. */
const rate = (r: number): string => `${r > 0 ? '+' : ''}${(r * 100).toFixed(1)}%`;
const ratio = (r: number): string => r.toFixed(1);
/** "2026-06" as the month a person would say. */
const monthName = (m: string): string => {
  const [y, mm] = m.split('-');
  const d = new Date(Number(y), Number(mm) - 1, 1);
  return `${d.toLocaleDateString('en-GB', { month: 'long' })} ${y}`;
};

/**
 * THE PICTURE: one history line and ONE shaded band.
 *
 * Not a fan chart — the Bank of England dropped theirs on the grounds they
 * convey little a reader can use — and not three confident lines, which is the
 * shape that reads as a prediction. One line for what happened, one band for
 * the range if the same rates repeated, and the band is deliberately the
 * vaguer-looking of the two.
 *
 * Pure SVG with a viewBox, so it scales to any width and costs no library.
 */
function Chart({ history, low, high, years, label }: {
  history: readonly { year: number; value: number }[];
  low: number; high: number; years: number; label: string;
}) {
  const W = 320;
  const H = 120;
  const PAD = 4;
  const past = history.length - 1;
  const span = past + years;
  const all = [...history.map((p) => p.value), low, high];
  const top = Math.max(...all);
  const bottom = Math.min(...all, 0);
  const x = (t: number): number => PAD + ((t + past) / span) * (W - PAD * 2);
  const y = (v: number): number => H - PAD - ((v - bottom) / (top - bottom || 1)) * (H - PAD * 2);

  const line = history.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.year).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const now = history[history.length - 1]?.value ?? 100;
  const band = `M${x(0).toFixed(1)},${y(now).toFixed(1)} `
    + `L${x(years).toFixed(1)},${y(high).toFixed(1)} `
    + `L${x(years).toFixed(1)},${y(low).toFixed(1)} Z`;

  return (
    <svg class="at-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      <path class="at-band" d={band} />
      <path class="at-line" d={line} />
      <line class="at-now" x1={x(0)} y1={PAD} x2={x(0)} y2={H - PAD} />
    </svg>
  );
}

/** One area's growth rates, for the comparison row. */
function CompareRow({ facts }: { facts: AreaFacts }) {
  const g = facts.growth[10];
  if (!g) return null;
  return <li class="at-compare-row">{C.compare.row(facts.name, rate(g.annualised.value))}</li>;
}

function Scenarios({ t, horizon }: { t: Trajectory; horizon: Horizon }) {
  if (t.scenarios === null) return null;
  const bands = t.scenarios.bands[horizon];
  const labels = { low: C.scenarios.low, central: C.scenarios.central, high: C.scenarios.high };
  return (
    <div class="at-horizon">
      <h4 class="at-horizon-h">{C.scenarios.horizon(horizon)}</h4>
      {/* The assumption is attached to the bands themselves, not to a footnote. */}
      <p class="at-assumption">{C.scenarios.assumption(t.scenarios.rates.years)}</p>
      {horizon === 10 && <p class="at-illustrative">{C.scenarios.illustrative}</p>}
      <ul class="at-bands">
        {bands.map((b) => (
          <li class={`at-band-row at-${b.key}`} key={b.key}>
            <span class="at-band-name">{labels[b.key]}</span>
            <span class="at-band-value">{C.scenarios.band(rate(b.rate), b.end.breakdown.result)}</span>
            <MathsAccordion breakdown={b.end.breakdown} label={C.scenarios.showMaths} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AreaTrajectoryPanel({ sector, price }: { sector: string | null; price: number | null }) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>('idle');
  const [t, setT] = useState<Trajectory | null>(null);
  /**
   * WHICH SECTOR HAS ALREADY BEEN FETCHED. Held in a ref, not in state, and
   * `load` is deliberately NOT a dependency below: an effect that both reads
   * and writes its own loading flag re-runs itself the moment it finishes, and
   * the panel sat on "Loading…" for ever. The sector is the only thing that
   * should ever cause a re-fetch.
   */
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open || sector === null || fetchedFor.current === sector) return;
    let live = true;
    fetchedFor.current = sector;
    setLoad('loading');
    void (async () => {
      try {
        const [file, codesFile] = await Promise.all([getAreaTrajectory(), getAreaCodes()]);
        if (!live) return;
        setT(trajectoryFor(file, codesForSector(codesFile, sector), price));
        setLoad('idle');
      } catch {
        // A miss here is not a broken page: the panel says so and the rest of
        // the analyser is untouched.
        if (live) { fetchedFor.current = null; setLoad('failed'); }
      }
    })();
    return () => { live = false; };
  }, [open, sector]);

  /**
   * The price changes as a person edits, and the scenarios compound from it —
   * so they are recomputed from the data already in hand, with no second fetch.
   */
  useEffect(() => {
    if (t === null || sector === null) return;
    void (async () => {
      const [file, codesFile] = await Promise.all([getAreaTrajectory(), getAreaCodes()]);
      setT(trajectoryFor(file, codesForSector(codesFile, sector), price));
    })();
  }, [price]);

  if (sector === null) return null;

  const subject = t?.subject ?? null;
  /** The line and the band, both from core, both in the same rebased units. */
  const history = subject ? historyPoints(subject.series) : [];
  /**
   * FIVE YEARS IS WHAT THE PICTURE SHOWS. Ten is offered below as figures and
   * flagged as illustrative, but drawing a ten-year band would give the widest,
   * least useful shape the most ink on the page.
   */
  const CHART_YEARS = 5;
  const ends = subject !== null && t?.scenarios != null
    ? bandEnds(subject.series, t.scenarios.rates, CHART_YEARS)
    : null;
  /**
   * The state flags, read OUT of the markup. A bare `load === 'loading'` inside
   * a JSX expression is counted by the inline-copy ratchet as a string a reader
   * might see, which is the ratchet doing its job with a blunt instrument —
   * naming the conditions here is both cheaper to read and honest about intent.
   */
  const isLoading = load === 'loading';
  const hasFailed = load === 'failed';
  const tooFewSales = t?.withheld === 'too-few-sales';

  return (
    <details class="at" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary class="at-summary">
        <span class="at-summary-line">{C.summary}</span>
        <span class="at-summary-hint">{C.summaryHint}</span>
      </summary>
      <div class="at-body">
        {isLoading && <p class="hint">{C.loading}</p>}
        {hasFailed && <p class="field-error" role="alert">{C.failed}</p>}
        {t !== null && subject !== null && (
          <>
            <h3 class="at-h">{C.heading}</h3>

            {/* The disclosure sits WITH the numbers, above everything. */}
            <p class="at-honest">{C.honest}</p>

            {t.fellBackFrom !== null && (
              <p class="at-fellback">
                {t.fellBackFrom.sales === null
                  ? C.withheld.tooFewSalesUnknown(t.fellBackFrom.name, MIN_TRANSACTIONS)
                  : C.withheld.tooFewSales(t.fellBackFrom.name, t.fellBackFrom.sales, MIN_TRANSACTIONS)}
                {' '}
                {C.withheld.fellBack(t.fellBackFrom.name, subject.name)}
              </p>
            )}

            <section class="at-block">
              <h4 class="at-block-h">{C.history.heading}</h4>
              <p class="at-forarea">{C.history.forArea(subject.name)}</p>
              <ul class="at-record">
                {[5, 10, 20].map((yrs) => {
                  const g = subject.growth[yrs];
                  if (!g) return null;
                  return (
                    <li class="at-record-row" key={yrs}>
                      <span class="at-record-label">{C.history.over(yrs)}</span>
                      <span class="at-record-value">
                        {rate(g.cumulative.value)} · {rate(g.annualised.value)} {C.history.aYear}
                      </span>
                      <MathsAccordion breakdown={g.annualised.breakdown} label={C.scenarios.showMaths} />
                    </li>
                  );
                })}
              </ul>
              <p class="at-source">{C.history.source(monthName(t.month))}</p>
            </section>

            {(t.region !== null || t.country !== null) && (
              <section class="at-block">
                <h4 class="at-block-h">{C.compare.heading}</h4>
                <ul class="at-compare">
                  <CompareRow facts={subject} />
                  {t.region !== null && <CompareRow facts={t.region} />}
                  {t.country !== null && <CompareRow facts={t.country} />}
                </ul>
                <p class="at-source">{C.compare.note}</p>
              </section>
            )}

            {subject.variability !== null && (
              <section class="at-block">
                <h4 class="at-block-h">{C.variability.heading}</h4>
                <p class="at-worst">{C.variability.worst(rate(subject.variability.worst), subject.variability.years)}</p>
                <p class="at-best">{C.variability.best(rate(subject.variability.best))}</p>
                <p class="at-fell">{C.variability.fell(subject.variability.fellCount, subject.variability.years)}</p>
              </section>
            )}

            <section class="at-block">
              <h4 class="at-block-h">{C.affordability.heading}</h4>
              {subject.affordability === null ? (
                <p class="hint">{C.affordability.none}</p>
              ) : (
                <>
                  <p class="at-afford">
                    {t.country?.affordability != null
                      ? C.affordability.line(ratio(subject.affordability), subject.name,
                        ratio(t.country.affordability), t.country.name)
                      : C.affordability.only(ratio(subject.affordability), subject.name)}
                  </p>
                  {t.affordability?.period != null && (
                    <p class="at-source">{C.affordability.measure(t.affordability.period.slice(0, 4))}</p>
                  )}
                </>
              )}
            </section>

            {t.scenarios !== null ? (
              <section class="at-block at-scenarios">
                <h4 class="at-block-h">{C.scenarios.heading}</h4>
                <p class="at-basis">{C.scenarios.basis(subject.name, t.scenarios.rates.years)}</p>
                {history.length > 0 && ends !== null && (
                  <>
                    <p class="at-chart-intro">{C.chartIntro(subject.name)}</p>
                    <Chart
                      history={history}
                      low={ends.low}
                      high={ends.high}
                      years={CHART_YEARS}
                      label={C.chartAlt(subject.name, history.length - 1)}
                    />
                    <p class="at-chart-key">
                      <span class="at-key-line">{C.chartHistoryLabel}</span>
                      <span class="at-key-band">{C.chartBandLabel}</span>
                    </p>
                  </>
                )}
                {HORIZONS.map((h) => <Scenarios t={t} horizon={h} key={h} />)}
                <p class="at-inflation">{C.scenarios.inflation}</p>
              </section>
            ) : (
              <p class="hint at-withheld">
                {tooFewSales
                  ? (subject.sales === null
                    ? C.withheld.tooFewSalesUnknown(subject.name, MIN_TRANSACTIONS)
                    : C.withheld.tooFewSales(subject.name, subject.sales, MIN_TRANSACTIONS))
                  : C.withheld.tooLittleHistory}
              </p>
            )}

            <p class="at-attribution">{C.attribution}</p>
          </>
        )}
      </div>
    </details>
  );
}

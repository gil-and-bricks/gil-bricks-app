// @vitest-environment happy-dom
/**
 * C1 — THE COMPARABLES COME FIRST, AND THE PAGE SAYS SO.
 *
 * Three promises, each tested by what is on screen rather than by what the code
 * intends:
 *
 *   THE FILTERS ARE VISIBLE before anybody presses anything. They were behind a
 *     button, so the three decisions the whole valuation rests on were
 *     invisible until somebody went looking for them.
 *   NOTHING WIDENS SILENTLY. Where the set was widened, the section says which
 *     step was taken and why; where it is still too thin, it says that too.
 *   THE FIGURE WAITS until the evidence has been seen — and once it has, it
 *     stays, because a number that came and went would be worse than either.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, h } from 'preact';
import { act } from 'preact/test-utils';
import { COMPARABLE_RULES, type ComparablesResult } from '@gil-bricks/core';
import { CompsModule } from './CompsModule';
import { ValuationGate } from './ValuationGate';
import { DEFAULTS, state } from './state';
import { COMPARABLES } from '../../config/comparables';
import { COPY } from '../../config/copy';
import { hasLooked, subjectKey } from '../../lib/comparablesLooked';
import { lookedAt, markEndOfListSeen, markWorked, __resetLooked } from './looked';

const SUBJECT = { postcode: 'CF37 1DL', paon: '9', saon: '' };

const comp = (i: number) => ({
  id: `s${i}`, date: '2026-06-01', price: 160_000 + i * 1000, type: 'T', tenure: 'F', newBuild: false,
  paon: String(i), saon: '', street: 'Test Street', town: 'Pontypridd', postcode: 'CF37 1DL',
  floorAreaSqm: 80, ppsqm: 2000 + i, lat: 51.6, lng: -3.34,
  distanceMiles: 0.1, included: true, links: {} as never,
});

const result = (n: number, over: Partial<ComparablesResult> = {}): ComparablesResult => ({
  subject: { lat: 51.6, lng: -3.34, sectorId: 'CF37 1', country: 'W92000004' } as never,
  comps: Array.from({ length: n }, (_, i) => comp(i + 1)) as never,
  stats: { count: n, typicalPrice: 162_000, typicalPpsqm: 2025, ppsqmCount: n, rangeP10P90: null, sqftCoveragePct: 100 },
  sectorsSearched: ['CF37 1'],
  asOf: '2026-07',
  radiusMiles: COMPARABLE_RULES.radiusMiles,
  periodMonths: COMPARABLE_RULES.periodMonths,
  propertyType: 'T',
  subjectSector: null,
  ...over,
});

let host: HTMLDivElement;
beforeEach(() => {
  __resetLooked();
  state.value = { ...DEFAULTS, ...SUBJECT, price: '160000', type: 'T', area: '80' };
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => { render(null, host); host.remove(); });

const mountComps = (props: Parameters<typeof CompsModule>[0]) =>
  act(() => { render(h(CompsModule, props), host); });

describe('the filters are on screen without pressing anything', () => {
  it('the three that decide the comparison are all rendered', () => {
    mountComps({ result: result(6) });
    const labels = [...host.querySelectorAll('label')].map((l) => l.textContent ?? '');
    for (const wanted of [
      COMPARABLES.filters.radius.label, COMPARABLES.filters.period.label, COMPARABLES.filters.propertyType.label,
    ]) {
      expect(labels.some((l) => l.startsWith(wanted)), `${wanted} is not on screen`).toBe(true);
    }
  });

  /**
   * The disclosure is still there — it can be CLOSED — but it does not START
   * closed. Asserting `open` rather than the absence of `<details>` is the
   * point: the ability to fold them away was never the problem.
   */
  /**
   * The disclosure is still there — the filters can be CLOSED — but they do not
   * START closed. Written as "no closed ancestor" rather than "the details has
   * `open`" so it says the same true thing in both flag states: with
   * `compsMobile` off there is no disclosure at all, and a test that skipped
   * itself there would be a lie in exactly the shape CLAUDE.md warns about.
   */
  it('and nothing is folded over them', () => {
    mountComps({ result: result(6) });
    const strip = host.querySelector('.filter-strip');
    expect(strip, 'the filters were not rendered at all').not.toBeNull();
    expect(strip!.closest('details:not([open])'), 'they start folded away behind a button').toBeNull();
  });

  it('the type filter offers the subject’s own type as the default', () => {
    mountComps({ result: result(6) });
    const options = [...host.querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toContain(COMPARABLES.filters.auto.type);
  });

  it('…and says plainly that it cannot match one when no type is set', () => {
    state.value = { ...state.value, type: '' };
    mountComps({ result: result(6) });
    const options = [...host.querySelectorAll('option')].map((o) => o.textContent);
    expect(options, 'a guessed type would be worse than none').toContain(COMPARABLES.filters.auto.typeUnknown);
  });

  /**
   * THE CONTROL CANNOT CONTRADICT THE LIST. The automatic option reports what
   * the engine actually ran with, read off the RESULT — so a set widened to 24
   * months cannot sit under a select still saying 12.
   */
  it('the automatic options report the filters the result was actually built with', () => {
    mountComps({ result: result(6, { periodMonths: 24, radiusMiles: 1 }) });
    const options = [...host.querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toContain(COMPARABLES.filters.auto.period(24));
    expect(options).toContain(COMPARABLES.filters.auto.radius(COMPARABLES.filters.radius.oneMile));
    expect(options, 'the default must not still be claimed').not.toContain(COMPARABLES.filters.auto.period(12));
  });

  it('and says what it can honestly match, rather than letting the list imply it was vetted', () => {
    mountComps({ result: result(6) });
    expect(host.textContent).toContain(COMPARABLES.rules.whatWeMatch);
    expect(host.textContent).toContain(COMPARABLES.rules.prune.heading);
    for (const line of COMPARABLES.rules.prune.items) expect(host.textContent).toContain(line);
  });
});

describe('nothing widens silently', () => {
  const R = COMPARABLE_RULES;

  it('says nothing about widening when nothing was widened', () => {
    mountComps({ result: result(6), stage: 'default' });
    expect(host.querySelector('.widen-note'), 'a notice with nothing to notice').toBeNull();
  });

  it('says so when the window was widened', () => {
    mountComps({ result: result(6, { periodMonths: 24 }), stage: 'wider-time' });
    expect(host.textContent).toContain(COMPARABLES.widened.time(R.minComparables, R.periodMonths, R.widen.periodMonths));
  });

  it('says BOTH steps when both were taken — the first would otherwise be hidden', () => {
    mountComps({ result: result(6, { periodMonths: 24, radiusMiles: 1 }), stage: 'wider-area' });
    expect(host.textContent).toContain(COMPARABLES.widened.time(R.minComparables, R.periodMonths, R.widen.periodMonths));
    expect(host.textContent).toContain(
      COMPARABLES.widened.area(R.minComparables, COMPARABLES.filters.radius.halfMile, COMPARABLES.filters.radius.oneMile),
    );
  });

  it('and says it is still too thin where it is, rather than leaving an absence unexplained', () => {
    mountComps({ result: result(3, { periodMonths: 24, radiusMiles: 1 }), stage: 'exhausted', tooFew: true });
    expect(host.textContent).toContain(COMPARABLES.widened.exhausted(3, R.minComparables));
  });

  it('names the person’s own filters as the reason where they set them', () => {
    state.value = { ...state.value, period: '6' };
    mountComps({ result: result(2), stage: 'default', tooFew: true });
    expect(host.textContent).toContain(COMPARABLES.widened.yourFilters(2, R.minComparables));
  });
});

/**
 * WHAT COUNTS AS HAVING LOOKED. The rule is pure and lives in a lib, so it is
 * tested as a rule; the wiring is tested by what the gate then shows.
 */
describe('what counts as having looked', () => {
  it('the fifth comparable having been on screen', () => {
    expect(hasLooked({ endOfListSeen: true, worked: false, canObserve: true })).toBe(true);
  });

  it('or having worked the evidence — a filter, a tick', () => {
    expect(hasLooked({ endOfListSeen: false, worked: true, canObserve: true })).toBe(true);
  });

  it('and neither, before either happens', () => {
    expect(hasLooked({ endOfListSeen: false, worked: false, canObserve: true })).toBe(false);
  });

  /**
   * IT FAILS OPEN. A figure withheld because OUR instrument is missing is a
   * worse failure than one shown a moment early: the person gets nothing, and
   * no explanation that is true.
   */
  it('and it opens where the browser cannot tell us what is on screen', () => {
    expect(hasLooked({ endOfListSeen: false, worked: false, canObserve: false })).toBe(true);
  });

  it('is remembered for the property, not for the filters', () => {
    expect(subjectKey({ postcode: 'cf37 1dl', paon: '9', saon: '' }))
      .toBe(subjectKey({ postcode: 'CF37 1DL ', paon: ' 9', saon: '' }));
    expect(subjectKey(SUBJECT)).not.toBe(subjectKey({ ...SUBJECT, paon: '10' }));
  });
});

describe('the gate itself', () => {
  it('starts closed for a property nobody has looked at', () => {
    expect(lookedAt(SUBJECT)).toBe(false);
  });

  it('opens when the fifth comparable has been on screen, and STAYS open', () => {
    markEndOfListSeen(SUBJECT);
    expect(lookedAt(SUBJECT)).toBe(true);
    // …across a re-render, a re-run, and a change of filters.
    state.value = { ...state.value, radius: '1' };
    expect(lookedAt(SUBJECT), 'changing a filter must not re-gate').toBe(true);
  });

  it('opens when somebody works the evidence instead', () => {
    markWorked(SUBJECT);
    expect(lookedAt(SUBJECT)).toBe(true);
  });

  it('but asks again for a different property — a different set of sales', () => {
    markEndOfListSeen(SUBJECT);
    expect(lookedAt({ ...SUBJECT, paon: '11' })).toBe(false);
  });

  it('and what stands in the figure’s place names what it depends on, and offers the way there', () => {
    let went = false;
    act(() => { render(h(ValuationGate, { onGo: () => { went = true; } }), host); });
    expect(host.textContent).toContain(COPY.valuation.reviewGate.line);
    expect(host.textContent).toContain(COPY.valuation.reviewGate.why);
    const cta = host.querySelector('button.btn-action') as HTMLButtonElement;
    expect(cta?.textContent).toBe(COPY.valuation.reviewGate.cta);
    cta.click();
    expect(went, 'the button must actually go somewhere').toBe(true);
    // The card keeps its heading and its place: only the figure is held back.
    expect(host.querySelector('#valuation')).not.toBeNull();
    expect(host.textContent).toContain(COPY.valuation.title);
  });
});

/**
 * C1 — THE BAR IS THE PRODUCT'S OWN "ENOUGH EVIDENCE" NUMBER, NOT A NEW ONE.
 *
 * The row the gate watches is `minComparables` down the list, so the bar for
 * having looked moves with the bar for there being anything to look at. The
 * first cut watched the LAST row, which on a real Pontypridd terrace meant
 * scrolling past fifty comparables — an endurance test rather than attention.
 */
describe('which row the gate watches', () => {
  /** The rows, in the layout this width renders — cards or table, never both. */
  const rows = () => [...host.querySelectorAll('.comp-card, .comps-table tbody tr')];
  const watched = () => rows().findIndex((r) => r.hasAttribute('data-gate-row'));

  it('is the fifth of a long list, not the fiftieth', () => {
    mountComps({ result: result(50) });
    expect(rows().length, 'the list must actually be long, or this proves nothing').toBe(50);
    expect(watched(), 'the gate waits for the last row of a 50-row list').toBe(COMPARABLE_RULES.minComparables - 1);
    expect(host.querySelectorAll('[data-gate-row]').length, 'exactly one row is watched').toBe(1);
  });

  it('and the last row of a list shorter than five', () => {
    mountComps({ result: result(3) });
    expect(rows().length).toBe(3);
    expect(watched(), 'a short list can never reach its fifth row').toBe(2);
  });
});

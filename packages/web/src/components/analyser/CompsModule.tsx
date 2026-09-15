import { fmtMoney } from '@gil-bricks/core';
import { COPY } from '../../config/copy';
import { compLinks, fullAddress, identifiesAProperty } from '@gil-bricks/core';
import type { Comp, ComparablesResult, SortKey } from '@gil-bricks/core';
import { computeStats, sortComps } from '@gil-bricks/core';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { state, update } from './state';
import { Tooltip } from './Tooltip';
import { MathsAccordion } from './Accordion';
import { tip } from '../../content/microcopy';
import { monthLabel } from '../../lib/area/area';
import { typicalPrice } from '@gil-bricks/core';
import { CompMap } from './CompMap';
import { hoveredCompId } from './mapSync';
import { features } from '../../config/features';
import { SECTION_STRIP } from '../../config/analyserSections';
import { COMPARABLES } from '../../config/comparables';
import { activeFilterCount, clearedFilters, laddered, wantsCards } from '../../lib/comparables';
import { markEndOfListSeen, markWorked } from './looked';
import { COMPARABLE_RULES, type RadiusMiles, type WidenStage } from '@gil-bricks/core';
import { useViewportWidth } from './useViewportWidth';

const AGE_LABEL = (c: Comp) => (c.newBuild ? COMPARABLES.saleAge.newBuild : COMPARABLES.saleAge.existing);

/**
 * C1 — how a radius READS. Keyed by the number the engine works in, so the word
 * and the figure can never come apart; the words themselves are config.
 */
const RADIUS_LABEL: Record<RadiusMiles, string> = {
  0.25: COMPARABLES.filters.radius.quarterMile,
  0.5: COMPARABLES.filters.radius.halfMile,
  1: COMPARABLES.filters.radius.oneMile,
};
const TYPE_LABEL: Record<string, string> = COMPARABLES.propertyTypes;
const TENURE_LABEL: Record<string, string> = COMPARABLES.tenures;

/**
 * `folded` (N2, features.sectionOverview): on the analyser this module is the
 * evidence BEHIND the answer, so it waits under a one-line summary until you
 * ask for it. On /comparables it IS the page — never folded there.
 */
/**
 * The links one comparable goes out to (C1), used by the phone card and the
 * desktop row so the two can never offer different things.
 *
 * Every link opens in a new tab: you are checking evidence, and losing the deal
 * you were working on to do it would be its own small disaster. The visible
 * word is short because the row is dense; the accessible name says the whole
 * promise, which is what a screen reader announces.
 */
/**
 * A comparable's links, SPLIT BY WHAT THEY ACTUALLY FIND (E11).
 *
 * Google and the Land Registry record reach that exact house. Rightmove and
 * Zoopla reach only the postcode's sold prices — there is no public,
 * non-scraping route to a listing (see @gil-bricks/core links.ts). Sitting side
 * by side and styled identically, the four hid that difference completely: the
 * operator pressed a postcode one, got a street back, and reasonably concluded
 * the door number was missing from our data.
 *
 * The fix is grouping, not explanation. Each scope is its own table column
 * under its own heading, so the difference is stated once for the whole table
 * and never repeated on a button. Nothing is added to any row.
 */
function CompActions({ c, scope }: { c: Comp; scope: 'property' | 'postcode' }) {
  const address = fullAddress({ saon: c.saon, paon: c.paon, street: c.street, postcode: c.postcode });
  const links = compLinks(c.id, { saon: c.saon, paon: c.paon, street: c.street, postcode: c.postcode });
  const A = COMPARABLES.actions;
  // E10 — a record with neither a house number nor a flat number is a STREET.
  // Land Registry has populated one or the other on every record we hold, so
  // this has never fired; it exists so that if one ever arrives, the button is
  // withheld rather than searching a street and calling it a house.
  const named = identifiesAProperty({ saon: c.saon, paon: c.paon });
  if (scope === 'property') {
    return (
      <span class="comp-actions">
        <a href={links.landRegistry} target="_blank" rel="noopener" aria-label={A.landRegistryFull(address)}>{A.landRegistry}</a>
        {named && (
          <a href={links.google} target="_blank" rel="noopener" aria-label={A.googleFull(address)}>{A.google}</a>
        )}
      </span>
    );
  }
  return (
    <span class="comp-actions">
      {links.rightmoveSoldPrices !== null && (
        <a href={links.rightmoveSoldPrices} target="_blank" rel="noopener" aria-label={A.rightmoveFull(c.postcode)}>{A.rightmove}</a>
      )}
      {links.zooplaSoldPrices !== null && (
        <a href={links.zooplaSoldPrices} target="_blank" rel="noopener" aria-label={A.zooplaFull(c.postcode)}>{A.zoopla}</a>
      )}
    </span>
  );
}

export function CompsModule({ result, stage = 'default', tooFew = false, article4 = false, folded = false }: {
  result: ComparablesResult | null;
  /** C1 — which rung of the ladder produced this set, from core's own run. */
  stage?: WidenStage;
  /** C1 — still short of the bar after widening as far as is honest. */
  tooFew?: boolean;
  article4?: boolean;
  folded?: boolean;
}) {
  const s = state.value;
  /**
   * C1 — THE FILTERS IN FORCE, READ OFF THE RESULT AND NEVER OFF THE STATE.
   *
   * The engine echoes what it actually ran with, so the 'Automatic' options and
   * the map's ring describe the list underneath them rather than the request
   * that produced it. Before the first result lands there is no list to
   * disagree with, so the defaults stand in.
   */
  const inForce = {
    radiusMiles: result?.radiusMiles ?? COMPARABLE_RULES.radiusMiles,
    periodMonths: result?.periodMonths ?? COMPARABLE_RULES.periodMonths,
  };


  const [sortKey, setSortKey] = useState<SortKey>('distance');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');

  const excluded = useMemo(() => new Set(s.excluded ? s.excluded.split(',') : []), [s.excluded]);
  const comps = useMemo(() => {
    if (!result) return [];
    const withFlags = result.comps.map((c) => ({ ...c, included: !excluded.has(c.id) }));
    return sortComps(withFlags, sortKey, dir);
  }, [result, excluded, sortKey, dir]);
  const stats = useMemo(() => computeStats(comps), [comps]);

  /**
   * C1 — THE FIFTH COMPARABLE, WATCHED.
   *
   * Not the last one. On a real Pontypridd terrace the default filters return
   * FIFTY comparables, and demanding the fiftieth be scrolled past would be an
   * endurance test rather than attention. Five is `minComparables` — the same
   * figure, from the same config, that decides whether a valuation may exist at
   * all — so the bar for having looked is the bar for there being anything to
   * look at. Fewer than five in the list and it is the last row.
   *
   * The observer is rebuilt whenever the list changes, because the row it
   * watches moves with it; and it is never created at all where the browser has
   * no IntersectionObserver, which is the case the gate opens for.
   */
  const endRef = useRef<Element | null>(null);
  /** Which row satisfies the gate: the fifth, or the last of a shorter list. */
  const gateRow = Math.min(COMPARABLE_RULES.minComparables, comps.length) - 1;
  const subject = { postcode: s.postcode, paon: s.paon, saon: s.saon };
  const subjectSeen = `${subject.postcode}|${subject.paon}|${subject.saon}`;
  useEffect(() => {
    const el = endRef.current;
    if (el === null || typeof IntersectionObserver !== 'function') return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) markEndOfListSeen(subject);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [subjectSeen, result === null, comps.length, gateRow]);

  // retain scroll position across the list⇄map swap (heights differ)
  const setView = (view: 'list' | 'map') => {
    const y = typeof window !== 'undefined' ? window.scrollY : 0;
    update({ view });
    if (typeof window !== 'undefined') requestAnimationFrame(() => window.scrollTo({ top: y }));
  };

  const toggle = (id: string) => {
    // C1 — ticking a sale off IS looking at the comparables. Withholding the
    // figure from somebody actively pruning the set would be absurd.
    markWorked(s);
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update({ excluded: [...next].join(',') });
  };
  const setSort = (k: SortKey) => {
    if (k === sortKey) setDir(dir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setDir('asc'); }
  };
  // The arrow on the heading doing the sorting — the arrows themselves are config.
  const sortArrow = (k: SortKey): string =>
    (sortKey === k ? (dir === 'asc' ? COMPARABLES.table.sortedAsc : COMPARABLES.table.sortedDesc) : '');

  // Fold only where this module is EVIDENCE (the analyser), only once there is
  // something to fold, and never over a map someone deep-linked to.
  // C1 — the data is £/m² natively; the UI used to convert AWAY from it into
  // square feet, which fought every other number in the product.
  const perSqm = stats.typicalPpsqm === null ? null : COMPARABLES.stats.foldPerSqm(Math.round(stats.typicalPpsqm));
  // The filters, written ONCE: folded behind one button at EVERY width while
  // compsMobile is on (seven controls dominate a phone and clutter a desktop),
  // or laid out as they always were when the flag is off.
  // C1 — changing a filter is working the evidence, so it satisfies the gate.
  // One wrapper, so a filter added later cannot forget to say so.
  const setFilter = (patch: Parameters<typeof update>[0]) => {
    markWorked(subject);
    update(patch);
  };
  const filterFields = (
        <div class="filter-strip" role="group" aria-label={COMPARABLES.filters.groupLabel}>
          <label><span class="fl-head">{COMPARABLES.filters.radius.label} <Tooltip text={COMPARABLES.filters.why.radius} /></span>
            <select value={s.radius} onChange={(e) => setFilter({ radius: (e.target as HTMLSelectElement).value as never })}>
              <option value="auto">{COMPARABLES.filters.auto.radius(RADIUS_LABEL[inForce.radiusMiles])}</option>
              <option value="0.25">{COMPARABLES.filters.radius.quarterMile}</option><option value="0.5">{COMPARABLES.filters.radius.halfMile}</option><option value="1">{COMPARABLES.filters.radius.oneMile}</option>
            </select>
          </label>
          <label><span class="fl-head">{COMPARABLES.filters.period.label} <Tooltip text={COMPARABLES.filters.why.period} /></span>
            <select value={s.period} onChange={(e) => setFilter({ period: (e.target as HTMLSelectElement).value as never })}>
              <option value="auto">{COMPARABLES.filters.auto.period(inForce.periodMonths)}</option>
              <option value="6">{COMPARABLES.filters.period.sixMonths}</option><option value="12">{COMPARABLES.filters.period.twelveMonths}</option><option value="24">{COMPARABLES.filters.period.twentyFourMonths}</option>
            </select>
          </label>
          <label><span class="fl-head">{COMPARABLES.filters.propertyType.label} <Tooltip text={COMPARABLES.filters.why.type} /></span>
            <select value={s.ctype} onChange={(e) => setFilter({ ctype: (e.target as HTMLSelectElement).value as never })}>
              <option value="auto">{s.type === '' ? COMPARABLES.filters.auto.typeUnknown : COMPARABLES.filters.auto.type}</option>
              <option value="all">{COMPARABLES.filters.propertyType.all}</option><option value="houses">{COMPARABLES.filters.propertyType.houses}</option><option value="D">{COMPARABLES.filters.propertyType.detached}</option>
              <option value="S">{COMPARABLES.filters.propertyType.semi}</option><option value="DS">{COMPARABLES.filters.propertyType.detachedAndSemi}</option><option value="T">{COMPARABLES.filters.propertyType.terraced}</option>
              <option value="F">{COMPARABLES.filters.propertyType.flats}</option>
            </select>
          </label>
          <label>{COMPARABLES.filters.tenure.label}
            <select value={s.tenure} onChange={(e) => setFilter({ tenure: (e.target as HTMLSelectElement).value as never })}>
              <option value="any">{COMPARABLES.filters.tenure.any}</option><option value="F">{COMPARABLES.filters.tenure.freehold}</option><option value="L">{COMPARABLES.filters.tenure.leasehold}</option>
            </select>
          </label>
          <label>{COMPARABLES.filters.age.label}
            <select value={s.cage} onChange={(e) => setFilter({ cage: (e.target as HTMLSelectElement).value as never })}>
              <option value="all">{COMPARABLES.filters.age.all}</option><option value="new">{COMPARABLES.filters.age.newBuild}</option><option value="old">{COMPARABLES.filters.age.existing}</option>
            </select>
          </label>
          <label>{COMPARABLES.filters.area.label}
            <span class="pair">
              <input inputMode="numeric" placeholder={COMPARABLES.filters.area.minPlaceholder} aria-label={COMPARABLES.filters.area.minLabel} value={s.minArea} onInput={(e) => setFilter({ minArea: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
              <input inputMode="numeric" placeholder={COMPARABLES.filters.area.maxPlaceholder} aria-label={COMPARABLES.filters.area.maxLabel} value={s.maxArea} onInput={(e) => setFilter({ maxArea: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
            </span>
          </label>
          <label>{COMPARABLES.filters.price.label}
            <span class="pair">
              <input inputMode="numeric" placeholder={COMPARABLES.filters.price.minPlaceholder} aria-label={COMPARABLES.filters.price.minLabel} value={s.minPrice} onInput={(e) => setFilter({ minPrice: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
              <input inputMode="numeric" placeholder={COMPARABLES.filters.price.maxPlaceholder} aria-label={COMPARABLES.filters.price.maxLabel} value={s.maxPrice} onInput={(e) => setFilter({ maxPrice: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
            </span>
          </label>
          </div>
  );

  /**
   * C1 — WHAT WE CAN HONESTLY MATCH, AND WHAT TO TAKE OUT.
   *
   * It sits WITH the filters, because that is where somebody is deciding what
   * this list should be. Type, distance and date are the three things Land
   * Registry publishes for every sale; a list filtered on them looks vetted and
   * is not, and the difference is a number somebody would otherwise trust. The
   * three lines under it are the pruning, in the fewest plain words that can
   * carry it — never a lesson, and never the vocabulary of a course.
   */
  const guidance = (
    <div class="comps-guidance">
      <p class="hint">{COMPARABLES.rules.whatWeMatch} {COMPARABLES.rules.yourRead}</p>
      <p class="prune-head">{COMPARABLES.rules.prune.heading}</p>
      <ul class="prune-list">
        {COMPARABLES.rules.prune.items.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </div>
  );

  /**
   * C1 — THE WIDENING, SAID OUT LOUD, AND NEVER INFERRED HERE.
   *
   * The stage comes from core's own run. Both rungs print when both fired,
   * because two steps were taken and saying only the second would hide one.
   * Where even the widened set is short, no valuation is shown at all and this
   * is where the reason goes — the card beside it is not the place to explain
   * an absence it did not decide.
   */
  const W = COMPARABLES.widened;
  const R = COMPARABLE_RULES;
  const widenNotes = result === null ? [] : [
    ...(stage === 'wider-time' || stage === 'wider-area' || stage === 'exhausted'
      ? [W.time(R.minComparables, R.periodMonths, R.widen.periodMonths)] : []),
    ...(stage === 'wider-area' || stage === 'exhausted'
      ? [W.area(R.minComparables, RADIUS_LABEL[R.radiusMiles], RADIUS_LABEL[R.widen.radiusMiles])] : []),
  ];

  // A phone gets a card per sale; a desktop keeps the table. ONE of the two is
  // built — never both — so a phone never carries an invisible 11-column table.
  const cards = wantsCards(useViewportWidth(), features.compsMobile);
  const filtersSet = activeFilterCount(s);

  // C1 — OPEN BY DEFAULT, at every width. This is the second most important
  // thing in the product and a one-line summary meant people simply missed it.
  // The disclosure stays so it can be CLOSED; it just no longer starts shut.
  // Seeded once, never re-asserted: re-asserting `open` on every render would
  // slam it shut under anyone who had closed it.
  const seedOpen = useRef(true);
  /**
   * C1 — THE FILTERS ARE OPEN BEFORE ANYONE PRESSES ANYTHING.
   *
   * They were behind a button, so the three decisions the whole valuation rests
   * on were invisible until somebody went looking for them — and the number one
   * press away looked like a property of the house rather than of a set they
   * could change. Seeded once, never re-asserted: re-asserting `open` on every
   * render would slam the sheet shut under anyone who had closed it.
   */
  const seedFiltersOpen = useRef(true);
  const fold = folded && features.sectionOverview && result !== null && result.comps.length > 0
    ? { line: SECTION_STRIP.compsSummary(stats.count, perSqm), open: seedOpen.current }
    : null;

  // The module's body, written ONCE: shown bare, or behind the fold's one line.
  const body = (
    <>
        {features.compsMobile ? (
        <details class="filter-sheet" open={seedFiltersOpen.current}>
          <summary class="filter-summary">
            {filtersSet === 0 ? COMPARABLES.filters.label : COMPARABLES.filters.withCount(filtersSet)}
          </summary>
          {filtersSet > 0 && (
            <button type="button" class="filter-clear" onClick={() => setFilter(clearedFilters())}>{COMPARABLES.filters.clear}</button>
          )}
          {filterFields}
          {guidance}
        </details>
      ) : <>{filterFields}{guidance}</>}

        {result === null ? (
          <p class="hint">{COPY.comps.waiting}</p>
        ) : result.comps.length === 0 ? (
          <div role="status">
            <h3 class="state-h">{COPY.comps.noneTitle}</h3>
            <p class="hint">{result.suggestion ?? COPY.comps.none}</p>
          </div>
        ) : (
          <>
            {widenNotes.map((note, i) => (
              <p class="hint widen-note" role="status" key={note}>
                {note}{i === 0 && <> <Tooltip text={W.whyTimeFirst} /></>}
              </p>
            ))}
            {tooFew && (
              <p class="hint widen-note" role="status">
                {laddered(s)
                  ? W.exhausted(stats.count, R.minComparables)
                  : W.yourFilters(stats.count, R.minComparables)}
              </p>
            )}
            {stats.count > 0 && stats.count < 3 && (
              <p class="hint thin-note" role="status">
                <strong>{COMPARABLES.stats.thinEvidenceLabel}</strong>{' '}{COMPARABLES.stats.thinEvidence(stats.count)}
              </p>
            )}
            <p class="count-line" role="status">
              <strong>{stats.count}</strong>{' '}{COMPARABLES.stats.ofSalesIncluded(result.comps.length)}{' '}
              <strong>{stats.typicalPrice !== null ? fmtMoney(stats.typicalPrice) : COMPARABLES.card.unknown}</strong>
              {stats.typicalPpsqm !== null && (
                <>{' '}{COMPARABLES.stats.typicalPerSqm} <strong>{COMPARABLES.card.perSqmValue(Math.round(stats.typicalPpsqm))}</strong> <Tooltip text={tip('comps.persqm')} /></>
              )}
              {stats.rangeP10P90 && (
                <>
                  {' '}{COMPARABLES.stats.range(fmtMoney(stats.rangeP10P90.p10), fmtMoney(stats.rangeP10P90.p90))}{' '}
                  <Tooltip text={tip('comps.range80')} />
                </>
              )}
              {' '}{COMPARABLES.stats.asOf(monthLabel(result.asOf))}
            </p>
            {stats.typicalPrice !== null && stats.count >= 1 && (
              <MathsAccordion breakdown={typicalPrice(comps.filter((c) => c.included).map((c) => c.price)).breakdown} />
            )}
            <p class="hint">{COMPARABLES.nonStandard.line} <Tooltip text={COMPARABLES.nonStandard.why} /></p>

            <div class="view-toggle" role="group" aria-label={COMPARABLES.view.groupLabel}>
              <button
                type="button"
                class={s.view === 'list' ? 'pill pill-current' : 'pill'}
                aria-pressed={s.view === 'list'}
                onClick={() => setView('list')}
              >
                {COMPARABLES.view.list}
              </button>
              <button
                type="button"
                class={s.view === 'map' ? 'pill pill-current' : 'pill'}
                aria-pressed={s.view === 'map'}
                onClick={() => setView('map')}
              >
                {COMPARABLES.view.map}
              </button>
              {s.view === 'map' && <span class="hint">{COPY.comps.listCarriesData}</span>}
            </div>
            {s.view === 'map' && comps.some((c) => !c.included) && (
              <span class="map-chip">{COMPARABLES.view.dimmed(comps.filter((c) => !c.included).length)}</span>
            )}
            {s.view === 'map' && (
              <CompMap
                article4={article4}
                subject={{ lat: result.subject.lat, lng: result.subject.lng }}
                radiusMiles={inForce.radiusMiles}
                comps={comps}
                selectedId={null}
              />
            )}
            {s.view === 'list' && <p class="hint">{COPY.comps.untick}</p>}
            {cards && (
              <ul class="comp-cards" aria-label={COMPARABLES.card.listLabel} hidden={s.view === 'map'}>
                {comps.map((c, i) => {
                  const address = [c.saon, c.paon, c.street].filter(Boolean).join(' ');
                  return (
                    <li
                      class={c.included ? 'comp-card' : 'comp-card is-out'}
                      key={c.id}
                      ref={i === gateRow ? (el) => { endRef.current = el; } : undefined}
                      data-gate-row={i === gateRow ? '' : undefined}
                    >
                      <label class="comp-tick">
                        <input type="checkbox" checked={c.included} onChange={() => toggle(c.id)}
                          aria-label={COMPARABLES.card.include(address)} />
                      </label>
                      <div class="comp-body">
                        <p class="comp-price"><strong>{fmtMoney(c.price)}</strong> <span class="comp-when">{c.date}</span></p>
                        <p class="comp-address">{address}</p>
                        <p class="comp-meta">
                          <span>{c.postcode}</span>
                          <span>{TYPE_LABEL[c.type] ?? c.type}</span>
                          <span>{TENURE_LABEL[c.tenure] ?? c.tenure}</span>
                        </p>
                        <p class="comp-meta">
                          <span>{c.floorAreaSqm !== null ? COMPARABLES.card.sqmValue(c.floorAreaSqm) : COMPARABLES.card.unknown}</span>
                          <span>{c.ppsqm !== null ? COMPARABLES.card.perSqmValue(Math.round(c.ppsqm)) : COMPARABLES.card.unknown}</span>
                          <span>{COMPARABLES.card.distanceValue(c.distanceMiles.toFixed(2))}</span>
                        </p>
                        {!c.included && <p class="comp-out">{COMPARABLES.card.excluded}</p>}
                        {/* No table header on a phone, so the two words go on
                            the card — once each, above their own pair. */}
                        <p class="comp-scope">{COMPARABLES.table.thisProperty}</p>
                        <CompActions c={c} scope="property" />
                        <p class="comp-scope">{COMPARABLES.table.thisPostcode}</p>
                        <CompActions c={c} scope="postcode" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {!cards && (
            <div class="table-wrap" hidden={s.view === 'map'}>
              <table class="comps-table">
                <thead>
                  <tr>
                    <th><span class="sr-only">{COMPARABLES.table.include}</span></th>
                    <th aria-sort={sortKey === 'date' ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" onClick={() => setSort('date')}>{COMPARABLES.table.date}{sortArrow('date')}</button></th>
                    <th>{COMPARABLES.table.address}</th>
                    <th class="comp-links-col">{COMPARABLES.table.thisProperty}</th>
                    <th class="comp-links-col">{COMPARABLES.table.thisPostcode}</th>
                    <th>{COMPARABLES.table.postcode}</th>
                    <th>{COMPARABLES.table.propertyType}</th>
                    <th>{COMPARABLES.table.tenure}</th>
                    <th aria-sort={sortKey === 'price' ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" onClick={() => setSort('price')}>{COMPARABLES.table.price}{sortArrow('price')}</button></th>
                    <th>{COMPARABLES.table.sqm}</th>
                    <th aria-sort={sortKey === 'ppsqm' ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" onClick={() => setSort('ppsqm')}>{COMPARABLES.table.perSqm}{sortArrow('ppsqm')}</button></th>
                    <th aria-sort={sortKey === 'distance' ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" onClick={() => setSort('distance')}>{COMPARABLES.table.miles}{sortArrow('distance')}</button></th>
                  </tr>
                </thead>
                <tbody>
                  {comps.map((c, i) => (
                    <tr
                      class={c.included ? '' : 'excluded'}
                      key={c.id}
                      ref={i === gateRow ? (el) => { endRef.current = el; } : undefined}
                      data-gate-row={i === gateRow ? '' : undefined}
                      onMouseEnter={() => (hoveredCompId.value = c.id)}
                      onMouseLeave={() => (hoveredCompId.value = null)}
                    >
                      <td>
                        <input type="checkbox" checked={c.included} onChange={() => toggle(c.id)}
                          aria-label={COMPARABLES.card.include([c.saon, c.paon, c.street].filter(Boolean).join(' '))} />
                      </td>
                      <td>{c.date}</td>
                      <td class="comp-address-cell">{[c.saon, c.paon, c.street].filter(Boolean).join(' ')}</td>
                      <td class="comp-links-col"><CompActions c={c} scope="property" /></td>
                      <td class="comp-links-col comp-links-area"><CompActions c={c} scope="postcode" /></td>
                      <td>{c.postcode}</td>
                      <td>{TYPE_LABEL[c.type] ?? c.type}</td>
                      <td>{TENURE_LABEL[c.tenure] ?? c.tenure}</td>
                      <td>{fmtMoney(c.price)}</td>
                      <td>{c.floorAreaSqm !== null ? c.floorAreaSqm : COMPARABLES.card.unknown}</td>
                      <td>{c.ppsqm !== null ? COMPARABLES.card.perSqmValue(Math.round(c.ppsqm)) : COMPARABLES.card.unknown}</td>
                      <td>{c.distanceMiles.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </>
        )}
    </>
  );

  return (
    <section class="glass card" id="sec-comps" aria-labelledby="comps-h">
      <h2 id="comps-h">{COMPARABLES.heading} <Tooltip text={tip('comps.typical')} /></h2>
      {fold === null ? body : (
        /* (N2) The evidence folds behind ONE line: the answer stays on screen,
           the workings wait until you ask for them. Native <details>, no JS. */
        <details class="comps-fold" open={fold.open}>
          <summary class="comps-summary">{fold.line}</summary>
          {body}
        </details>
      )}
    </section>
  );
}

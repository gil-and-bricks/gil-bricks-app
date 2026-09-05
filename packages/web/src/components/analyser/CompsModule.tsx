import { fmtMoney } from '@gil-bricks/core';
import { COPY } from '../../config/copy';
import { sqmToSqft } from '@gil-bricks/core';
import type { Comp, ComparablesResult, SortKey } from '@gil-bricks/core';
import { computeStats, sortComps } from '@gil-bricks/core';
import { useMemo, useRef, useState } from 'preact/hooks';
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
import { activeFilterCount, clearedFilters, wantsCards } from '../../lib/comparables';
import { useViewportWidth } from './useViewportWidth';

const AGE_LABEL = (c: Comp) => (c.newBuild ? COMPARABLES.saleAge.newBuild : COMPARABLES.saleAge.existing);
const TYPE_LABEL: Record<string, string> = COMPARABLES.propertyTypes;
const TENURE_LABEL: Record<string, string> = COMPARABLES.tenures;

/**
 * `folded` (N2, features.sectionOverview): on the analyser this module is the
 * evidence BEHIND the answer, so it waits under a one-line summary until you
 * ask for it. On /comparables it IS the page — never folded there.
 */
export function CompsModule({ result, article4 = false, folded = false }: { result: ComparablesResult | null; article4?: boolean; folded?: boolean }) {
  const s = state.value;
  const [sortKey, setSortKey] = useState<SortKey>('distance');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');

  const excluded = useMemo(() => new Set(s.excluded ? s.excluded.split(',') : []), [s.excluded]);
  const comps = useMemo(() => {
    if (!result) return [];
    const withFlags = result.comps.map((c) => ({ ...c, included: !excluded.has(c.id) }));
    return sortComps(withFlags, sortKey, dir);
  }, [result, excluded, sortKey, dir]);
  const stats = useMemo(() => computeStats(comps), [comps]);

  // retain scroll position across the list⇄map swap (heights differ)
  const setView = (view: 'list' | 'map') => {
    const y = typeof window !== 'undefined' ? window.scrollY : 0;
    update({ view });
    if (typeof window !== 'undefined') requestAnimationFrame(() => window.scrollTo({ top: y }));
  };

  const toggle = (id: string) => {
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
  const perSqft = stats.typicalPpsqm === null ? null : COMPARABLES.stats.foldPerSqft(Math.round(stats.typicalPpsqm / sqmToSqft(1)));
  // The filters, written ONCE: folded behind one button at EVERY width while
  // compsMobile is on (seven controls dominate a phone and clutter a desktop),
  // or laid out as they always were when the flag is off.
  const filterFields = (
        <div class="filter-strip" role="group" aria-label={COMPARABLES.filters.groupLabel}>
          <label>{COMPARABLES.filters.radius.label}
            <select value={s.radius} onChange={(e) => update({ radius: (e.target as HTMLSelectElement).value as never })}>
              <option value="0.25">{COMPARABLES.filters.radius.quarterMile}</option><option value="0.5">{COMPARABLES.filters.radius.halfMile}</option><option value="1">{COMPARABLES.filters.radius.oneMile}</option>
            </select>
          </label>
          <label>{COMPARABLES.filters.period.label}
            <select value={s.period} onChange={(e) => update({ period: (e.target as HTMLSelectElement).value as never })}>
              <option value="6">{COMPARABLES.filters.period.sixMonths}</option><option value="12">{COMPARABLES.filters.period.twelveMonths}</option>
            </select>
          </label>
          <label>{COMPARABLES.filters.propertyType.label}
            <select value={s.ctype} onChange={(e) => update({ ctype: (e.target as HTMLSelectElement).value as never })}>
              <option value="all">{COMPARABLES.filters.propertyType.all}</option><option value="houses">{COMPARABLES.filters.propertyType.houses}</option><option value="D">{COMPARABLES.filters.propertyType.detached}</option>
              <option value="S">{COMPARABLES.filters.propertyType.semi}</option><option value="DS">{COMPARABLES.filters.propertyType.detachedAndSemi}</option><option value="T">{COMPARABLES.filters.propertyType.terraced}</option>
              <option value="F">{COMPARABLES.filters.propertyType.flats}</option>
            </select>
          </label>
          <label>{COMPARABLES.filters.tenure.label}
            <select value={s.tenure} onChange={(e) => update({ tenure: (e.target as HTMLSelectElement).value as never })}>
              <option value="any">{COMPARABLES.filters.tenure.any}</option><option value="F">{COMPARABLES.filters.tenure.freehold}</option><option value="L">{COMPARABLES.filters.tenure.leasehold}</option>
            </select>
          </label>
          <label>{COMPARABLES.filters.age.label}
            <select value={s.cage} onChange={(e) => update({ cage: (e.target as HTMLSelectElement).value as never })}>
              <option value="all">{COMPARABLES.filters.age.all}</option><option value="new">{COMPARABLES.filters.age.newBuild}</option><option value="old">{COMPARABLES.filters.age.existing}</option>
            </select>
          </label>
          <label>{COMPARABLES.filters.area.label}
            <span class="pair">
              <input inputMode="numeric" placeholder={COMPARABLES.filters.area.minPlaceholder} aria-label={COMPARABLES.filters.area.minLabel} value={s.minArea} onInput={(e) => update({ minArea: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
              <input inputMode="numeric" placeholder={COMPARABLES.filters.area.maxPlaceholder} aria-label={COMPARABLES.filters.area.maxLabel} value={s.maxArea} onInput={(e) => update({ maxArea: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
            </span>
          </label>
          <label>{COMPARABLES.filters.price.label}
            <span class="pair">
              <input inputMode="numeric" placeholder={COMPARABLES.filters.price.minPlaceholder} aria-label={COMPARABLES.filters.price.minLabel} value={s.minPrice} onInput={(e) => update({ minPrice: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
              <input inputMode="numeric" placeholder={COMPARABLES.filters.price.maxPlaceholder} aria-label={COMPARABLES.filters.price.maxLabel} value={s.maxPrice} onInput={(e) => update({ maxPrice: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
            </span>
          </label>
          </div>
  );

  // A phone gets a card per sale; a desktop keeps the table. ONE of the two is
  // built — never both — so a phone never carries an invisible 11-column table.
  const cards = wantsCards(useViewportWidth(), features.compsMobile);
  const filtersSet = activeFilterCount(s);

  // The ?view=map deep link SEEDS the fold open once. After that the <details>
  // owns its own state: re-asserting `open` on every render would slam it shut
  // under anyone who switched the view back to the list.
  const seedOpen = useRef(s.view === 'map');
  const fold = folded && features.sectionOverview && result !== null && result.comps.length > 0
    ? { line: SECTION_STRIP.compsSummary(stats.count, perSqft), open: seedOpen.current }
    : null;

  // The module's body, written ONCE: shown bare, or behind the fold's one line.
  const body = (
    <>
        {features.compsMobile ? (
        <details class="filter-sheet">
          <summary class="filter-summary">
            {filtersSet === 0 ? COMPARABLES.filters.label : COMPARABLES.filters.withCount(filtersSet)}
          </summary>
          {filtersSet > 0 && (
            <button type="button" class="filter-clear" onClick={() => update(clearedFilters())}>{COMPARABLES.filters.clear}</button>
          )}
          {filterFields}
        </details>
      ) : filterFields}

        {result === null ? (
          <p class="hint">{COPY.comps.waiting}</p>
        ) : result.comps.length === 0 ? (
          <div role="status">
            <h3 class="state-h">{COPY.comps.noneTitle}</h3>
            <p class="hint">{result.suggestion ?? COPY.comps.none}</p>
          </div>
        ) : (
          <>
            {stats.count > 0 && stats.count < 3 && (
              <p class="hint thin-note" role="status">
                <strong>{COMPARABLES.stats.thinEvidenceLabel}</strong>{' '}{COMPARABLES.stats.thinEvidence(stats.count)}
              </p>
            )}
            <p class="count-line" role="status">
              <strong>{stats.count}</strong>{' '}{COMPARABLES.stats.ofSalesIncluded(result.comps.length)}{' '}
              <strong>{stats.typicalPrice !== null ? fmtMoney(stats.typicalPrice) : COMPARABLES.card.unknown}</strong>
              {stats.typicalPpsqm !== null && (
                <>{' '}{COMPARABLES.stats.typicalPerSqft} <strong>{COMPARABLES.card.perSqftValue(Math.round(stats.typicalPpsqm / sqmToSqft(1)))}</strong> <Tooltip text={tip('comps.persqft')} /></>
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
                radiusMiles={Number(s.radius)}
                comps={comps}
                selectedId={null}
              />
            )}
            {s.view === 'list' && <p class="hint">{COPY.comps.untick}</p>}
            {cards && (
              <ul class="comp-cards" aria-label={COMPARABLES.card.listLabel} hidden={s.view === 'map'}>
                {comps.map((c) => {
                  const address = [c.saon, c.paon, c.street].filter(Boolean).join(' ');
                  return (
                    <li class={c.included ? 'comp-card' : 'comp-card is-out'} key={c.id}>
                      <label class="comp-tick">
                        <input type="checkbox" checked={c.included} onChange={() => toggle(c.id)}
                          aria-label={COMPARABLES.card.include(address)} />
                      </label>
                      <div class="comp-body">
                        <p class="comp-price"><strong>{fmtMoney(c.price)}</strong> <span class="comp-when">{c.date}</span></p>
                        <p class="comp-address"><a href={`/transaction?id=${encodeURIComponent(c.id.replace(/[{}]/g, ''))}`}>{address}</a></p>
                        <p class="comp-meta">
                          <span>{c.postcode}</span>
                          <span>{TYPE_LABEL[c.type] ?? c.type}</span>
                          <span>{TENURE_LABEL[c.tenure] ?? c.tenure}</span>
                          <span>{AGE_LABEL(c)}</span>
                        </p>
                        <p class="comp-meta">
                          <span>{c.floorAreaSqm !== null ? COMPARABLES.card.sqftValue(Math.round(sqmToSqft(c.floorAreaSqm))) : COMPARABLES.card.unknown}</span>
                          <span>{c.ppsqm !== null ? COMPARABLES.card.perSqftValue(Math.round(c.ppsqm / sqmToSqft(1))) : COMPARABLES.card.unknown}</span>
                          <span>{COMPARABLES.card.distanceValue(c.distanceMiles.toFixed(2))}</span>
                        </p>
                        {!c.included && <p class="comp-out">{COMPARABLES.card.excluded}</p>}
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
                    <th>{COMPARABLES.table.postcode}</th>
                    <th>{COMPARABLES.table.propertyType}</th>
                    <th>{COMPARABLES.table.tenure}</th>
                    <th>{COMPARABLES.table.age}</th>
                    <th aria-sort={sortKey === 'price' ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" onClick={() => setSort('price')}>{COMPARABLES.table.price}{sortArrow('price')}</button></th>
                    <th>{COMPARABLES.table.sqft}</th>
                    <th aria-sort={sortKey === 'ppsqm' ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" onClick={() => setSort('ppsqm')}>{COMPARABLES.table.perSqft}{sortArrow('ppsqm')}</button></th>
                    <th aria-sort={sortKey === 'distance' ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" onClick={() => setSort('distance')}>{COMPARABLES.table.miles}{sortArrow('distance')}</button></th>
                  </tr>
                </thead>
                <tbody>
                  {comps.map((c) => (
                    <tr
                      class={c.included ? '' : 'excluded'}
                      key={c.id}
                      onMouseEnter={() => (hoveredCompId.value = c.id)}
                      onMouseLeave={() => (hoveredCompId.value = null)}
                    >
                      <td>
                        <input type="checkbox" checked={c.included} onChange={() => toggle(c.id)}
                          aria-label={COMPARABLES.card.include([c.saon, c.paon, c.street].filter(Boolean).join(' '))} />
                      </td>
                      <td>{c.date}</td>
                      <td><a href={`/transaction?id=${encodeURIComponent(c.id.replace(/[{}]/g, ''))}`}>{[c.saon, c.paon, c.street].filter(Boolean).join(' ')}</a></td>
                      <td>{c.postcode}</td>
                      <td>{TYPE_LABEL[c.type] ?? c.type}</td>
                      <td>{TENURE_LABEL[c.tenure] ?? c.tenure}</td>
                      <td>{AGE_LABEL(c)}</td>
                      <td>{fmtMoney(c.price)}</td>
                      <td>{c.floorAreaSqm !== null ? Math.round(sqmToSqft(c.floorAreaSqm)) : COMPARABLES.card.unknown}</td>
                      <td>{c.ppsqm !== null ? `£${Math.round(c.ppsqm / sqmToSqft(1))}` : COMPARABLES.card.unknown}</td>
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

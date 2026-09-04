import { fmtMoney } from '@gil-bricks/core';
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

const AGE_LABEL = (c: Comp) => (c.newBuild ? 'New' : 'Existing');
const TYPE_LABEL: Record<string, string> = { D: 'Detached', S: 'Semi-detached', T: 'Terraced', F: 'Flat', O: 'Other' };
const TENURE_LABEL: Record<string, string> = { F: 'Freehold', L: 'Leasehold' };

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

  // Fold only where this module is EVIDENCE (the analyser), only once there is
  // something to fold, and never over a map someone deep-linked to.
  const perSqft = stats.typicalPpsqm === null ? null : `£${Math.round(stats.typicalPpsqm / sqmToSqft(1))}/sq ft`;
  // The filters, written ONCE: folded behind one button at EVERY width while
  // compsMobile is on (seven controls dominate a phone and clutter a desktop),
  // or laid out as they always were when the flag is off.
  const filterFields = (
        <div class="filter-strip" role="group" aria-label="Comparable filters">
          <label>Radius
            <select value={s.radius} onChange={(e) => update({ radius: (e.target as HTMLSelectElement).value as never })}>
              <option value="0.25">¼ mile</option><option value="0.5">½ mile</option><option value="1">1 mile</option>
            </select>
          </label>
          <label>Period
            <select value={s.period} onChange={(e) => update({ period: (e.target as HTMLSelectElement).value as never })}>
              <option value="6">6 months</option><option value="12">12 months</option>
            </select>
          </label>
          <label>Type
            <select value={s.ctype} onChange={(e) => update({ ctype: (e.target as HTMLSelectElement).value as never })}>
              <option value="all">All</option><option value="houses">Houses</option><option value="D">Detached</option>
              <option value="S">Semi</option><option value="DS">Det + semi</option><option value="T">Terraced</option>
              <option value="F">Flats</option>
            </select>
          </label>
          <label>Tenure
            <select value={s.tenure} onChange={(e) => update({ tenure: (e.target as HTMLSelectElement).value as never })}>
              <option value="any">Any</option><option value="F">Freehold</option><option value="L">Leasehold</option>
            </select>
          </label>
          <label>Age
            <select value={s.cage} onChange={(e) => update({ cage: (e.target as HTMLSelectElement).value as never })}>
              <option value="all">All</option><option value="new">New build</option><option value="old">Existing</option>
            </select>
          </label>
          <label>Area sqm
            <span class="pair">
              <input inputMode="numeric" placeholder="min" aria-label="Minimum area (sqm)" value={s.minArea} onInput={(e) => update({ minArea: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
              <input inputMode="numeric" placeholder="max" aria-label="Maximum area (sqm)" value={s.maxArea} onInput={(e) => update({ maxArea: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
            </span>
          </label>
          <label>Price £
            <span class="pair">
              <input inputMode="numeric" placeholder="min" aria-label="Minimum price (£)" value={s.minPrice} onInput={(e) => update({ minPrice: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
              <input inputMode="numeric" placeholder="max" aria-label="Maximum price (£)" value={s.maxPrice} onInput={(e) => update({ maxPrice: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, '') })} />
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
          <p class="hint">Waiting for a postcode…</p>
        ) : result.comps.length === 0 ? (
          <div role="status">
            <h3 class="state-h">No matching sales</h3>
            <p class="hint">{result.suggestion ?? 'No sold prices matched this search near this postcode.'}</p>
          </div>
        ) : (
          <>
            {stats.count > 0 && stats.count < 3 && (
              <p class="hint thin-note" role="status">
                <strong>Thin evidence:</strong> only {stats.count} matching {stats.count === 1 ? 'sale' : 'sales'} nearby — treat the typical figures below with caution.
              </p>
            )}
            <p class="count-line" role="status">
              <strong>{stats.count}</strong> of {result.comps.length} sales included · typical{' '}
              <strong>{stats.typicalPrice !== null ? fmtMoney(stats.typicalPrice) : '—'}</strong>
              {stats.typicalPpsqm !== null && (
                <> · typical <strong>£{Math.round(stats.typicalPpsqm / sqmToSqft(1))}/sqft</strong> <Tooltip text={tip('comps.persqft')} /></>
              )}
              {stats.rangeP10P90 && (
                <>
                  {' '}· 80% between {fmtMoney(stats.rangeP10P90.p10)} and {fmtMoney(stats.rangeP10P90.p90)}{' '}
                  <Tooltip text={tip('comps.range80')} />
                </>
              )}
              {' '}· as of {monthLabel(result.asOf)}
            </p>
            {stats.typicalPrice !== null && stats.count >= 1 && (
              <MathsAccordion breakdown={typicalPrice(comps.filter((c) => c.included).map((c) => c.price)).breakdown} />
            )}
            <div class="view-toggle" role="group" aria-label="Comparables view">
              <button
                type="button"
                class={s.view === 'list' ? 'pill pill-current' : 'pill'}
                aria-pressed={s.view === 'list'}
                onClick={() => setView('list')}
              >
                List
              </button>
              <button
                type="button"
                class={s.view === 'map' ? 'pill pill-current' : 'pill'}
                aria-pressed={s.view === 'map'}
                onClick={() => setView('map')}
              >
                Map
              </button>
              {s.view === 'map' && <span class="hint">The list view carries the same data for keyboard and screen-reader use.</span>}
            </div>
            {s.view === 'map' && comps.some((c) => !c.included) && (
              <span class="map-chip">{comps.filter((c) => !c.included).length} dimmed — excluded from the stats</span>
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
            {s.view === 'list' && <p class="hint">Untick a row to leave it out — the stats recalculate instantly.</p>}
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
                    <th><span class="sr-only">Include</span></th>
                    <th aria-sort={sortKey === 'date' ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" onClick={() => setSort('date')}>Date{sortKey === 'date' ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>
                    <th>Address</th>
                    <th>Postcode</th>
                    <th>Type</th>
                    <th>Tenure</th>
                    <th>Age</th>
                    <th aria-sort={sortKey === 'price' ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" onClick={() => setSort('price')}>Price{sortKey === 'price' ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>
                    <th>Sqft</th>
                    <th aria-sort={sortKey === 'ppsqm' ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" onClick={() => setSort('ppsqm')}>£/sqft{sortKey === 'ppsqm' ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>
                    <th aria-sort={sortKey === 'distance' ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" onClick={() => setSort('distance')}>Miles{sortKey === 'distance' ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>
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
                          aria-label={`Include ${[c.saon, c.paon, c.street].filter(Boolean).join(' ')}`} />
                      </td>
                      <td>{c.date}</td>
                      <td><a href={`/transaction?id=${encodeURIComponent(c.id.replace(/[{}]/g, ''))}`}>{[c.saon, c.paon, c.street].filter(Boolean).join(' ')}</a></td>
                      <td>{c.postcode}</td>
                      <td>{TYPE_LABEL[c.type] ?? c.type}</td>
                      <td>{TENURE_LABEL[c.tenure] ?? c.tenure}</td>
                      <td>{AGE_LABEL(c)}</td>
                      <td>{fmtMoney(c.price)}</td>
                      <td>{c.floorAreaSqm !== null ? Math.round(sqmToSqft(c.floorAreaSqm)) : '—'}</td>
                      <td>{c.ppsqm !== null ? `£${Math.round(c.ppsqm / sqmToSqft(1))}` : '—'}</td>
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
      <h2 id="comps-h">Sold nearby <Tooltip text={tip('comps.typical')} /></h2>
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

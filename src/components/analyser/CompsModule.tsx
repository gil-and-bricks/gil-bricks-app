import { fmtMoney } from '../../lib/maths/format';
import { sqmToSqft } from '../../lib/maths/area';
import type { Comp, ComparablesResult, SortKey } from '../../lib/comparables/engine';
import { computeStats, sortComps } from '../../lib/comparables/engine';
import { useMemo, useState } from 'preact/hooks';
import { state, update } from './state';
import { CompMap } from './CompMap';
import { hoveredCompId } from './mapSync';

const AGE_LABEL = (c: Comp) => (c.newBuild ? 'New' : 'Existing');

export function CompsModule({ result, article4 = false }: { result: ComparablesResult | null; article4?: boolean }) {
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

  return (
    <section class="glass card" aria-labelledby="comps-h">
      <h2 id="comps-h">Sold nearby</h2>
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

      {result === null ? (
        <p class="hint">Waiting for a postcode…</p>
      ) : result.comps.length === 0 ? (
        <p class="hint" role="status">{result.suggestion ?? 'No sales found.'}</p>
      ) : (
        <>
          <p class="count-line" role="status">
            <strong>{stats.count}</strong> of {result.comps.length} sales included · typical{' '}
            <strong>{stats.typicalPrice !== null ? fmtMoney(stats.typicalPrice) : '—'}</strong>
            {stats.typicalPpsqm !== null && (
              <> · typical <strong>£{Math.round(stats.typicalPpsqm / sqmToSqft(1))}/sqft</strong></>
            )}
            {stats.rangeP10P90 && (
              <> · 80% between {fmtMoney(stats.rangeP10P90.p10)} and {fmtMoney(stats.rangeP10P90.p90)}</>
            )}
            {' '}· as of {result.asOf}
          </p>
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
            {s.view === 'map' && <span class="hint">The table view carries the same data for keyboard and screen-reader use.</span>}
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
                    <td>{c.type}</td>
                    <td>{c.tenure}</td>
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
        </>
      )}
    </section>
  );
}

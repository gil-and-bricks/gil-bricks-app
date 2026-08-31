/**
 * Area Data dashboard island. Everything shown comes from official open data
 * already on R2: sector sold prices (HM Land Registry PPD + EPC areas),
 * UK HPI (country level), IMD 2025 / WIMD 2025 deprivation (never blended).
 * The 1-mile comparison reuses the ONE ComparablesEngine.
 */
import type * as preact from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { computeStats, findComparables, type ComparablesResult } from '../../lib/comparables/engine';
import { geocodePostcode, type GeocodedPostcode } from '../../lib/comparables/geocode';
import { ComparablesError } from '../../lib/comparables/errors';
import { DataError, getAreaStats, getManifest, getSector, getUkhpi } from '../../lib/data/client';
import type { AreaStats, Manifest, SectorFile, UkhpiFile } from '../../lib/data/types';
import { decileWords, hpiChangePct, hpiSeries, modalTown, monthLabel } from '../../lib/area/area';
import { fetchCrimeSummary, type CrimeSummary } from '../../lib/area/crime';
import { fetchFloodAlerts, OFFICIAL_LINKS, type FloodAlert } from '../../lib/area/flood';
import { sqmToSqft } from '../../lib/maths/area';
import { fmtMoney } from '../../lib/maths/format';
import { strategies } from '../../config/strategies';
import { Accordion } from '../analyser/Accordion';
import { tip } from '../../content/microcopy';
import { CompMap } from '../analyser/CompMap';
import { Tooltip } from '../analyser/Tooltip';

type Ready = {
  subject: GeocodedPostcode;
  sector: SectorFile | null; // null = no sales in the last 12 months
  entry: AreaStats | null;
  ukhpi: UkhpiFile;
  manifest: Manifest;
  /** Streams in after first paint — the 1-mile sweep needs the big sectors index. 'failed' = sweep errored. */
  mile: ComparablesResult | null | 'failed';
  /** Live layers load after the sold-data cards; failures never block them. */
  crime: CrimeSummary | 'loading' | 'failed';
  /** 'wales' = live alerts come from NRW (link-out), not the EA API. */
  flood: FloodAlert[] | 'loading' | 'failed' | 'wales';
};

/** Per-postcode session cache so tab-hopping doesn't rehit the official APIs. */
const layerCache = new Map<string, { crime?: CrimeSummary; flood?: FloodAlert[] }>();
type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | ({ kind: 'ready' } & Ready);

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])\w/g, (c) => c.toUpperCase());

/** External official-service link: new tab, noopener, with a visible + screen-reader new-tab cue. */
function ExtLink({ href, children }: { href: string; children: preact.ComponentChildren }) {
  return (
    <a href={href} target="_blank" rel="noopener">
      {children}
      <span aria-hidden="true"> ↗</span>
      <span class="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function AreaApp() {
  const [pc, setPc] = useState('');
  const [view, setView] = useState<View>({ kind: 'idle' });
  const seq = useRef(0);

  const search = async (raw: string, push: boolean) => {
    const mySeq = ++seq.current;
    setView({ kind: 'loading' });
    try {
      // Country-agnostic fetches start before geocoding — one less round trip
      // on the critical render path.
      const ukhpiPromise = getUkhpi();
      const manifestPromise = getManifest();
      const subject = await geocodePostcode(raw);
      if (push) {
        history.replaceState(null, '', `?pc=${encodeURIComponent(subject.postcode)}`);
      }
      // Phase 2 kicked off first but NOT awaited: the 1-mile sweep pulls the
      // full sectors index (~0.9MB uncompressed), so the dashboard paints from
      // the small fetches and the comparison line streams in when ready.
      const milePromise = findComparables({ postcode: subject.postcode, radiusMiles: 1, periodMonths: 12, propertyType: 'all', tenure: 'any', age: 'all' });
      const notFoundNull = (e: unknown) => {
        if (e instanceof DataError && e.kind === 'NotFound') return null;
        throw e;
      };
      const [sector, areaStats, ukhpi, manifest] = await Promise.all([
        getSector(subject.sectorId).catch(notFoundNull),
        // Optional extras: ANY data error (404, 429, bad body) degrades to
        // "not available" rather than failing the whole page.
        getAreaStats(subject.sectorId.split(' ')[0]).catch((e) => {
          if (e instanceof DataError) return null;
          throw e;
        }),
        ukhpiPromise,
        manifestPromise,
      ]);
      if (seq.current !== mySeq) return;
      const entry = areaStats?.[subject.sectorId] ?? null;
      const cached = layerCache.get(subject.postcode) ?? {};
      const isWales = subject.country === 'W92000004';
      setView({
        kind: 'ready',
        subject,
        sector,
        entry,
        ukhpi,
        manifest,
        mile: null,
        crime: cached.crime ?? 'loading',
        flood: isWales ? 'wales' : cached.flood ?? 'loading',
      });
      if (!cached.crime) {
        fetchCrimeSummary(subject.lat, subject.lng)
          .then((crime) => {
            layerCache.set(subject.postcode, { ...layerCache.get(subject.postcode), crime });
            if (seq.current !== mySeq) return;
            setView((v) => (v.kind === 'ready' ? { ...v, crime } : v));
          })
          .catch(() => {
            if (seq.current !== mySeq) return;
            setView((v) => (v.kind === 'ready' ? { ...v, crime: 'failed' } : v));
          });
      }
      if (!isWales && !cached.flood) {
        fetchFloodAlerts(subject.lat, subject.lng)
          .then((flood) => {
            layerCache.set(subject.postcode, { ...layerCache.get(subject.postcode), flood });
            if (seq.current !== mySeq) return;
            setView((v) => (v.kind === 'ready' ? { ...v, flood } : v));
          })
          .catch(() => {
            if (seq.current !== mySeq) return;
            setView((v) => (v.kind === 'ready' ? { ...v, flood: 'failed' } : v));
          });
      }
      milePromise
        .then((mile) => {
          if (seq.current !== mySeq) return;
          setView((v) => (v.kind === 'ready' ? { ...v, mile } : v));
        })
        .catch(() => {
          // The comparison is an extra, never a page error — but a failure
          // must be admitted, not shown as forever-loading.
          if (seq.current !== mySeq) return;
          setView((v) => (v.kind === 'ready' ? { ...v, mile: 'failed' } : v));
        });
    } catch (err) {
      if (seq.current !== mySeq) return;
      const message =
        err instanceof ComparablesError
          ? err.message
          : 'Something went wrong loading the data — please try again in a moment.';
      setView({ kind: 'error', message });
    }
  };

  useEffect(() => {
    const q = new URLSearchParams(location.search).get('pc');
    if (q) {
      setPc(q);
      void search(q, false);
    }
  }, []);

  const submit = (e: Event) => {
    e.preventDefault();
    if (pc.trim() !== '') void search(pc, true);
  };

  return (
    <div class="area">
      <form class="area-search glass card" action="/area-data" method="get" onSubmit={submit}>
        <label for="area-pc">Postcode</label>
        <div class="area-search-row">
          <input id="area-pc" name="pc" value={pc} placeholder="e.g. CF37 1DL" onInput={(e) => setPc((e.target as HTMLInputElement).value)} />
          <button type="submit" class="btn-primary">See area data</button>
        </div>
      </form>

      <p class="sr-only" role="status">
        {view.kind === 'loading' ? 'Loading area data…' : view.kind === 'ready' ? 'Area data loaded.' : ''}
      </p>

      {view.kind === 'loading' && (
        <div class="area-loading">
          {[0, 1, 2, 3, 4].map(() => (
            <div class="glass card" aria-hidden="true">
              <div class="skeleton sk-title" />
              <div class="skeleton sk-line" />
              <div class="skeleton sk-line short" />
            </div>
          ))}
        </div>
      )}

      {view.kind === 'error' && <div class="glass card area-error" role="alert">{view.message}</div>}

      {view.kind === 'ready' && <Dashboard {...view} />}
    </div>
  );
}

function Dashboard({ subject, sector, entry, ukhpi, manifest, mile, crime, flood }: Ready) {
  const countryName = subject.country === 'W92000004' ? 'Wales' : 'England';
  const town = sector ? modalTown(sector.sales) : null;
  const asOf = monthLabel(manifest.ppdMonth);
  const stats = sector?.stats ?? null;
  const thin = sector !== null && sector.sales.length < 3;

  // deprivation — strictly the index matching the sector's country
  const decile = subject.country === 'W92000004' ? entry?.wimdDecile : entry?.imdDecile;
  const coverage = subject.country === 'W92000004' ? entry?.wimdCoverage : entry?.imdCoverage;
  const depSource = subject.country === 'W92000004' ? 'Welsh Index of Multiple Deprivation 2025' : 'Index of Multiple Deprivation 2025';

  // HPI trend — country level (honest label; no local granularity yet)
  const index = ukhpi.index[subject.country];
  const series = hpiSeries(index, ukhpi.ukhpiMonth, 5);
  const chg1 = hpiChangePct(index, ukhpi.ukhpiMonth, 1);
  const chg5 = hpiChangePct(index, ukhpi.ukhpiMonth, 5);

  // "Surroundings" must mean OTHER sectors: comparing the sector against a
  // pool containing its own sales dampens the stated difference (verified:
  // 74 of 158 CF37 1HR mile comps were CF37 1's own).
  const sectorOf = (postcode: string) => /^(\S+ \d)/.exec(postcode)?.[1] ?? '';
  const around = mile !== null && mile !== 'failed' ? mile.comps.filter((c) => c.included && sectorOf(c.postcode) !== subject.sectorId) : [];
  const aroundStats = around.length > 0 ? computeStats(around) : null;
  const aroundSectors = new Set(around.map((c) => sectorOf(c.postcode))).size;
  const mileTypical = aroundStats?.typicalPrice ?? null;
  const vsMile =
    stats && mileTypical !== null && mileTypical > 0 && around.length >= 3
      ? Math.round(((stats.typicalPrice - mileTypical) / mileTypical) * 100)
      : null;

  const perSqft = stats?.typicalPpsqm != null ? Math.round(stats.typicalPpsqm / sqmToSqft(1)) : null;
  const drop = stats ? Math.floor(stats.count / 4) : 0;

  return (
    <>
      <div class="glass card area-head">
        <h2>
          {subject.sectorId}
          {town ? ` · ${titleCase(town)}` : ''}
        </h2>
        <p class="hint">
          <span class="badge">{countryName}</span> Sold data to {asOf} · postcode {subject.postcode}
        </p>
      </div>

      {sector === null && (
        <div class="glass card">
          <h3>No recorded sales here in the last 12 months</h3>
          <p>
            HM Land Registry has no sales for sector {subject.sectorId} in the year to {asOf}. That usually means a very
            thin market rather than a problem with the postcode — try the surroundings below, or{' '}
            <a href={`/comparables?postcode=${encodeURIComponent(subject.postcode)}`}>browse sold comparables</a> within a mile.
          </p>
        </div>
      )}

      {thin && stats && (
        <div class="glass card area-thin">
          <strong>Thin market:</strong> only {stats.count} recorded {stats.count === 1 ? 'sale' : 'sales'} in the last 12
          months — treat every number here with caution.
        </div>
      )}

      {stats && (
        <div class="glass card">
          <h3>
            Sold prices in {subject.sectorId} <Tooltip text={tip('area.soldPrices')} />
          </h3>
          <p class="big-figure">{fmtMoney(stats.typicalPrice)}</p>
          <p class="count-line">
            typical sold price from {stats.count} {stats.count === 1 ? 'sale' : 'sales'}
            {stats.count >= 3 && (
              <>
                {' '}· 80% sold between {fmtMoney(stats.p10Price)} and {fmtMoney(stats.p90Price)}
              </>
            )}
            {perSqft !== null && (
              <>
                {' '}· typical <strong>£{perSqft}/sqft</strong>
              </>
            )}
          </p>
          {entry?.typicalPriceByType && (
            <table class="area-types">
              <caption class="sr-only">Typical sold price by property type</caption>
              <thead>
                <tr><th scope="col">Detached</th><th scope="col">Semi</th><th scope="col">Terraced</th><th scope="col">Flat</th></tr>
              </thead>
              <tbody>
                <tr>
                  {(['D', 'S', 'T', 'F'] as const).map((t) => (
                    <td>{entry.typicalPriceByType![t] !== null ? fmtMoney(entry.typicalPriceByType![t]!) : <span class="hint">not enough sales</span>}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
          <p class="area-vs" aria-live="polite">
            {mile === null ? (
              <span class="area-vs-wait">
                Comparing with everything sold within 1 mile of this postcode — the wider sweep takes a moment longer…
              </span>
            ) : mile === 'failed' ? (
              <span class="area-vs-wait">The 1-mile comparison isn't available right now — everything above still is.</span>
            ) : vsMile !== null ? (
              <>
                {vsMile === 0 ? 'In line with' : `${Math.abs(vsMile)}% ${vsMile > 0 ? 'above' : 'below'}`} the surrounding
                mile (typical {fmtMoney(mileTypical!)} from {around.length} sales in {aroundSectors} nearby{' '}
                {aroundSectors === 1 ? 'sector' : 'sectors'}, this sector excluded).
              </>
            ) : (
              <span class="area-vs-wait">Not enough sales in the surrounding mile for a fair comparison.</span>
            )}
          </p>
          <Accordion label="How is the typical price worked out?">
            <p>
              We list every sale in the sector from the last 12 months in price order, set aside the cheapest quarter and
              the dearest quarter, and average the rest. With {stats.count} sales that means setting aside {drop} from
              each end and averaging the middle {stats.count - 2 * drop}. Statisticians call this the interquartile mean —
              it stops one mansion or one bargain dragging the number around.
            </p>
          </Accordion>
        </div>
      )}

      {mile !== null && mile !== 'failed' && mile.comps.length > 0 && (
        <AreaMapCard subject={{ lat: subject.lat, lng: subject.lng }} mile={mile} />
      )}

      <div class="glass card">
        <h3>
          Price trend — {countryName} <Tooltip text={tip('area.priceTrend')} />
        </h3>
        {series.length >= 2 ? (
          <>
            <TrendLine series={series} label={`${countryName} UK HPI over 5 years`} />
            <p class="count-line">
              {chg1 !== null && (
                <>
                  1 year: <strong>{chg1 > 0 ? '+' : ''}{chg1}%</strong>
                </>
              )}
              {chg1 !== null && chg5 !== null && ' · '}
              {chg5 !== null && (
                <>
                  5 years: <strong>{chg5 > 0 ? '+' : ''}{chg5}%</strong>
                </>
              )}
              {' '}· UK HPI to {monthLabel(ukhpi.ukhpiMonth)}
            </p>
            <p class="hint">
              This is the {countryName}-wide index, not a local one — local sold prices above are the better guide to this
              exact area.
            </p>
          </>
        ) : (
          <p class="hint">Index data not available.</p>
        )}
      </div>

      {entry?.salesByMonth && (
        <div class="glass card">
          <h3>
            Market activity <Tooltip text={tip('area.marketActivity')} />
          </h3>
          <Sparkline counts={entry.salesByMonth} asOf={manifest.ppdMonth} />
          <p class="count-line">
            {entry.salesByMonth.reduce((a, b) => a + b, 0)} sales in the 12 months to {asOf}
            {entry.newBuildShare !== undefined && <>{' '}· {Math.round(entry.newBuildShare * 100)}% new build</>}
            {entry.freeholdShare !== undefined && (
              <>{' '}· {Math.round(entry.freeholdShare * 100)}% freehold / {100 - Math.round(entry.freeholdShare * 100)}% leasehold</>
            )}
          </p>
        </div>
      )}

      <div class="glass card">
        <h3>
          Deprivation <Tooltip text={tip('area.deprivation')} />
        </h3>
        {decile !== undefined && decile !== null ? (
          <>
            <div class="dep-scale" role="img" aria-label={`Decile ${decile} of 10 — ${decileWords(decile)}`}>
              {Array.from({ length: 10 }, (_, i) => (
                <span class={i + 1 === decile ? 'dep-cell dep-on' : 'dep-cell'} aria-hidden="true">
                  {i + 1}
                </span>
              ))}
            </div>
            <p>
              This sector is {decileWords(decile)} of {countryName} (decile {decile} of 10, where 1 is the most deprived
              tenth and 10 the least).
            </p>
            <p class="hint">
              Source: {depSource}
              {coverage !== undefined && coverage < 0.9 && <> · based on {Math.round(coverage * 100)}% of postcodes here</>}
              . Deprivation summarises official statistics on income, employment, health, education, crime, housing and
              environment for small areas — it says nothing about any individual street or property, so read it alongside
              the sold prices above, not instead of them.
            </p>
          </>
        ) : (
          <p class="hint">Not available for this sector.</p>
        )}
      </div>

      <div class="glass card layer-card">
        <h3>
          Crime <Tooltip text={tip('area.crime')} />
        </h3>
        <span class="sr-only" role="status">{crime === 'loading' ? 'Loading crime data…' : ''}</span>
        {crime === 'loading' ? (
          <div aria-hidden="true">
            <div class="skeleton sk-line" />
            <div class="skeleton sk-line short" />
          </div>
        ) : crime === 'failed' ? (
          <p class="hint">Crime data unavailable right now (police.uk).</p>
        ) : (
          <>
            <p class="count-line">
              <strong>{crime.total}</strong> incidents recorded in {monthLabel(crime.month)} within{' '}
              {crime.radiusMiles === 1 ? '1 mile' : 'roughly half a mile'} of this postcode
            </p>
            {crime.radiusMiles === 0.5 && (
              <p class="hint">The full 1-mile list was too large to fetch, so these numbers cover roughly half a mile.</p>
            )}
            {crime.top.length > 0 && (
              <ul class="crime-list">
                {crime.top.map((t) => (
                  <li>
                    {t.label} <strong>{t.count}</strong>
                  </li>
                ))}
              </ul>
            )}
            <p class="hint">
              Raw counts carry no judgement about any street or person — compare areas by using the same radius. Totals
              reflect what each police force publishes to police.uk; some forces publish incomplete street-level data.
              Crime data: data.police.uk (OGL v3).
            </p>
          </>
        )}
      </div>

      <div class="glass card layer-card">
        <h3>
          Flood <Tooltip text={tip('area.flood')} />
        </h3>
        <span class="sr-only" role="status">{flood === 'loading' ? 'Loading flood data…' : ''}</span>
        {flood === 'loading' ? (
          <div aria-hidden="true">
            <div class="skeleton sk-line" />
            <div class="skeleton sk-line short" />
          </div>
        ) : flood === 'failed' ? (
          <p class="hint">Live flood data unavailable right now (Environment Agency).</p>
        ) : flood === 'wales' ? (
          <p>
            Live flood alerts for Wales are published by Natural Resources Wales —{' '}
            <ExtLink href={OFFICIAL_LINKS.floodAlertsWales}>see live alerts (NRW)</ExtLink>
            .
          </p>
        ) : flood.length === 0 ? (
          <>
            <p>No current flood alerts in this area.</p>
            <p class="hint">Uses Environment Agency flood and river level data from the real-time data API (Beta).</p>
          </>
        ) : (
          <>
            <p>
              <strong>{flood.length}</strong> current flood {flood.length === 1 ? 'alert' : 'alerts'} in or near this
              area (within about 3 miles):
            </p>
            <ul class="crime-list">
              {flood.map((a) => (
                <li>
                  {a.name} <span class="hint">({a.severity})</span>
                </li>
              ))}
            </ul>
            <p class="hint">Uses Environment Agency flood and river level data from the real-time data API (Beta).</p>
          </>
        )}
        <p class="hint">
          Long-term risk is a different question —{' '}
          <ExtLink href={subject.country === 'W92000004' ? OFFICIAL_LINKS.floodRiskWales : OFFICIAL_LINKS.floodRiskEngland}>
            check long-term flood risk for this postcode ({subject.country === 'W92000004' ? 'NRW' : 'GOV.UK'})
          </ExtLink>
          .
        </p>
      </div>

      <div class="glass card">
        <h3>Official checks</h3>
        <ul class="checks-list">
          <li>
            <ExtLink href={subject.country === 'W92000004' ? OFFICIAL_LINKS.floodRiskWales : OFFICIAL_LINKS.floodRiskEngland}>
              Long-term flood risk checker ({subject.country === 'W92000004' ? 'NRW' : 'GOV.UK'})
            </ExtLink>
          </li>
          <li>
            <ExtLink href={OFFICIAL_LINKS.councilTaxBands}>Council tax band checker (GOV.UK)</ExtLink>
          </li>
          <li>
            <ExtLink href={OFFICIAL_LINKS.findLocalCouncil}>Find your local council — HMO and licensing questions (GOV.UK)</ExtLink>
          </li>
          <li>
            <ExtLink href={OFFICIAL_LINKS.landRegistrySoldPrices}>Sold prices (HM Land Registry)</ExtLink>
          </li>
        </ul>
        <p class="hint">These are official services — we link, we don't copy.</p>
      </div>

      <nav class="glass card area-strip" aria-label="Analyse a property here">
        <span class="area-strip-label">Analyse a property here as</span>
        <span class="area-strip-links">
          {strategies.map((s) => (
            <a class="pill" href={`${s.route}/analyser?postcode=${encodeURIComponent(subject.postcode)}`}>{s.name}</a>
          ))}
          <a class="pill" href={`/comparables?postcode=${encodeURIComponent(subject.postcode)}`}>Sold comparables</a>
        </span>
      </nav>
    </>
  );
}

function AreaMapCard({ subject, mile }: { subject: { lat: number; lng: number }; mile: ComparablesResult }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="glass card">
      <h3>
        Where these sold <Tooltip text={tip('area.whereSold')} />
      </h3>
      <button
        type="button"
        class="btn-secondary"
        aria-expanded={open}
        aria-controls="area-map-body"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide map' : 'Show map'}
      </button>
      <div id="area-map-body" hidden={!open}>
        {open && <CompMap subject={subject} radiusMiles={1} comps={mile.comps} selectedId={null} variant="density" />}
      </div>
    </div>
  );
}

function TrendLine({ series, label }: { series: { month: string; value: number }[]; label: string }) {
  const W = 560;
  const H = 120;
  const vals = series.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pts = series
    .map((p, i) => `${((i / (series.length - 1)) * W).toFixed(1)},${(H - 8 - ((p.value - min) / span) * (H - 16)).toFixed(1)}`)
    .join(' ');
  return (
    <svg class="trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--accent)" stroke-width="2" />
    </svg>
  );
}

function Sparkline({ counts, asOf }: { counts: number[]; asOf: string }) {
  const max = Math.max(...counts, 1);
  return (
    <div class="spark" role="img" aria-label={`Monthly sales over the 12 months to ${monthLabel(asOf)}: ${counts.join(', ')}`}>
      {counts.map((c) => (
        <span
          class={c === 0 ? 'spark-bar spark-zero' : 'spark-bar'}
          style={`height:${c === 0 ? 2 : Math.max(6, Math.round((c / max) * 48))}px`}
          aria-hidden="true"
          title={String(c)}
        />
      ))}
    </div>
  );
}

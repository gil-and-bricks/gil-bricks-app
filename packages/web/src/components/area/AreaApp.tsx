/**
 * Area Data dashboard island. Everything shown comes from official open data
 * already on R2: sector sold prices (HM Land Registry PPD + EPC areas),
 * UK HPI (country level), IMD 2025 / WIMD 2025 deprivation (never blended).
 * The 1-mile comparison reuses the ONE ComparablesEngine.
 */
import type * as preact from 'preact';
import { AREA_COPY } from '../../config/area';
import { COPY } from '../../config/copy';
import { useEffect, useRef, useState } from 'preact/hooks';
import { computeStats, findComparables, type ComparablesResult } from '@gil-bricks/core';
import { geocodePostcode, type GeocodedPostcode } from '@gil-bricks/core';
import { ComparablesError } from '@gil-bricks/core';
import { DataError, getAreaStats, getManifest, getSector, getUkhpi } from '@gil-bricks/core';
import type { AreaStats, Manifest, SectorFile, UkhpiFile } from '@gil-bricks/core';
import { decileWords, hpiChangePct, hpiSeries, modalTown, monthLabel } from '../../lib/area/area';
import { fetchCrimeSummary, type CrimeSummary } from '../../lib/area/crime';
import { fetchFloodAlerts, OFFICIAL_LINKS, type FloodAlert } from '../../lib/area/flood';
import { sqmToSqft } from '@gil-bricks/core';
import { fmtMoney } from '@gil-bricks/core';
import { strategies } from '@gil-bricks/core';
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
      <span aria-hidden="true">{AREA_COPY.externalLink.icon}</span>
      <span class="sr-only">{AREA_COPY.externalLink.newTab}</span>
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
          : AREA_COPY.errors.loadFailed;
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
        <label for="area-pc">{AREA_COPY.search.label}</label>
        <div class="area-search-row">
          <input id="area-pc" name="pc" required value={pc} placeholder={AREA_COPY.search.placeholder} onInput={(e) => setPc((e.target as HTMLInputElement).value)} />
          <button type="submit" class="btn-primary">{AREA_COPY.search.submit}</button>
        </div>
      </form>

      <p class="sr-only" role="status">
        {view.kind === 'loading' ? AREA_COPY.status.loading : view.kind === 'ready' ? AREA_COPY.status.loaded : ''}
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
  const countryName = subject.country === 'W92000004' ? AREA_COPY.countries.wales : AREA_COPY.countries.england;
  const town = sector ? modalTown(sector.sales) : null;
  const asOf = monthLabel(manifest.ppdMonth);
  const stats = sector?.stats ?? null;
  const thin = sector !== null && sector.sales.length < 3;

  // deprivation — strictly the index matching the sector's country
  const decile = subject.country === 'W92000004' ? entry?.wimdDecile : entry?.imdDecile;
  const coverage = subject.country === 'W92000004' ? entry?.wimdCoverage : entry?.imdCoverage;
  const depSource = subject.country === 'W92000004' ? AREA_COPY.deprivation.sourceWales : AREA_COPY.deprivation.sourceEngland;

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
          <span class="badge">{countryName}</span> {AREA_COPY.header.soldDataTo} {asOf} {AREA_COPY.header.postcode} {subject.postcode}
        </p>
      </div>

      {sector === null && (
        <div class="glass card">
          <h3>{AREA_COPY.noSales.heading}</h3>
          <p>
            {COPY.area.thinMarket}{' '}
            <a href={`/comparables?postcode=${encodeURIComponent(subject.postcode)}`}>{COPY.area.thinMarketCta}</a>.
          </p>
        </div>
      )}

      {thin && stats && (
        <div class="glass card area-thin">
          <strong>{AREA_COPY.thinMarket.label}</strong>{' '}
          {AREA_COPY.thinMarket.body(stats.count)}
        </div>
      )}

      {stats && (
        <div class="glass card">
          <h3>
            {AREA_COPY.soldPrices.heading} {subject.sectorId} <Tooltip text={tip('area.soldPrices')} />
          </h3>
          <p class="big-figure">{fmtMoney(stats.typicalPrice)}</p>
          <p class="count-line">
            {AREA_COPY.soldPrices.count(stats.count)}
            {stats.count >= 3 && (
              <>
                {' '}{AREA_COPY.soldPrices.spread(fmtMoney(stats.p10Price), fmtMoney(stats.p90Price))}
              </>
            )}
            {perSqft !== null && (
              <>
                {' '}{AREA_COPY.soldPrices.perSqftLead} <strong>{AREA_COPY.soldPrices.perSqft(perSqft)}</strong> <Tooltip text={tip('comps.persqft')} />
              </>
            )}
          </p>
          {entry?.typicalPriceByType && (
            <table class="area-types">
              <caption class="area-types-caption">{AREA_COPY.propertyTypes.caption}</caption>
              <thead>
                <tr><th scope="col">{AREA_COPY.propertyTypes.detached}</th><th scope="col">{AREA_COPY.propertyTypes.semi}</th><th scope="col">{AREA_COPY.propertyTypes.terraced}</th><th scope="col">{AREA_COPY.propertyTypes.flat}</th></tr>
              </thead>
              <tbody>
                <tr>
                  {(['D', 'S', 'T', 'F'] as const).map((t) => (
                    <td>{entry.typicalPriceByType![t] !== null ? fmtMoney(entry.typicalPriceByType![t]!) : <span class="hint">{AREA_COPY.propertyTypes.notEnough}</span>}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
          <p class="area-vs" aria-live="polite">
            {mile === null ? (
              <span class="area-vs-wait">
                {COPY.area.wideSweep}
              </span>
            ) : mile === 'failed' ? (
              <span class="area-vs-wait">{AREA_COPY.surroundings.failed}</span>
            ) : vsMile !== null ? (
              <>
                {vsMile === 0 ? AREA_COPY.surroundings.inLine : AREA_COPY.surroundings.difference(Math.abs(vsMile), vsMile > 0)}{' '}
                {AREA_COPY.surroundings.body(fmtMoney(mileTypical!), around.length, aroundSectors)}
              </>
            ) : (
              <span class="area-vs-wait">{AREA_COPY.surroundings.notEnough}</span>
            )}
          </p>
          <Accordion label={AREA_COPY.typicalMaths.label}>
            <p>
              {AREA_COPY.typicalMaths.body(stats.count, drop, stats.count - 2 * drop)}
            </p>
          </Accordion>
        </div>
      )}

      {mile !== null && mile !== 'failed' && mile.comps.length > 0 && (
        <AreaMapCard subject={{ lat: subject.lat, lng: subject.lng }} mile={mile} />
      )}

      <div class="glass card">
        <h3>
          {AREA_COPY.trend.heading} {countryName} <Tooltip text={tip('area.priceTrend')} />
        </h3>
        {series.length >= 2 ? (
          <>
            <TrendLine series={series} label={AREA_COPY.trend.chartLabel(countryName)} />
            <p class="count-line">
              {chg1 !== null && (
                <>
                  {AREA_COPY.trend.oneYear} <strong>{chg1 > 0 ? '+' : ''}{chg1}%</strong>
                </>
              )}
              {chg1 !== null && chg5 !== null && ' · '}
              {chg5 !== null && (
                <>
                  {AREA_COPY.trend.fiveYears} <strong>{chg5 > 0 ? '+' : ''}{chg5}%</strong>
                </>
              )}
              {' '}{AREA_COPY.trend.asOfLead} {monthLabel(ukhpi.ukhpiMonth)}
            </p>
            <p class="hint">
              {COPY.area.hpiScope(countryName)}
            </p>
          </>
        ) : (
          <p class="hint">{COPY.area.hpiUnavailable}</p>
        )}
      </div>

      {entry?.salesByMonth && (
        <div class="glass card">
          <h3>
            {AREA_COPY.activity.heading} <Tooltip text={tip('area.marketActivity')} />
          </h3>
          <Sparkline counts={entry.salesByMonth} asOf={manifest.ppdMonth} />
          <p class="count-line">
            {entry.salesByMonth.reduce((a, b) => a + b, 0)} {AREA_COPY.activity.salesTo} {asOf}
            {entry.newBuildShare !== undefined && <>{' '}{AREA_COPY.activity.newBuild(Math.round(entry.newBuildShare * 100))}</>}
            {entry.freeholdShare !== undefined && (
              <>{' '}{AREA_COPY.activity.tenure(Math.round(entry.freeholdShare * 100), 100 - Math.round(entry.freeholdShare * 100))}</>
            )}
          </p>
        </div>
      )}

      <div class="glass card">
        <h3>
          {AREA_COPY.deprivation.heading} <Tooltip text={tip('area.deprivation')} />
        </h3>
        {decile !== undefined && decile !== null ? (
          <>
            <div class="dep-scale" role="img" aria-label={AREA_COPY.deprivation.scaleLabel(decile, decileWords(decile))}>
              {Array.from({ length: 10 }, (_, i) => (
                <span class={i + 1 === decile ? 'dep-cell dep-on' : 'dep-cell'} aria-hidden="true">
                  {i + 1}
                </span>
              ))}
            </div>
            <p>
              {AREA_COPY.deprivation.sentence(decileWords(decile), countryName, decile)}
            </p>
            <p class="hint">
              {AREA_COPY.deprivation.sourceLead} {depSource}
              {coverage !== undefined && coverage < 0.9 && <>{' '}{AREA_COPY.deprivation.coverage(Math.round(coverage * 100))}</>}
              . {COPY.area.deprivationScope}
            </p>
          </>
        ) : (
          <p class="hint">{COPY.area.deprivationMissing}</p>
        )}
      </div>

      <div class="glass card layer-card">
        <h3>
          {AREA_COPY.crime.heading} <Tooltip text={tip('area.crime')} />
        </h3>
        <span class="sr-only" role="status">{crime === 'loading' ? AREA_COPY.crime.loading : ''}</span>
        {crime === 'loading' ? (
          <div aria-hidden="true">
            <div class="skeleton sk-line" />
            <div class="skeleton sk-line short" />
          </div>
        ) : crime === 'failed' ? (
          <p class="hint">{AREA_COPY.crime.unavailable}</p>
        ) : (
          <>
            <p class="count-line">
              <strong>{crime.total}</strong>{' '}
              {AREA_COPY.crime.summary(monthLabel(crime.month), crime.radiusMiles === 1 ? AREA_COPY.crime.oneMile : AREA_COPY.crime.halfMile)}
            </p>
            {crime.radiusMiles === 0.5 && (
              <p class="hint">{COPY.area.crimeHalfMile}</p>
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
              {COPY.area.crimeScope} {AREA_COPY.crime.attribution}
            </p>
          </>
        )}
      </div>

      <div class="glass card layer-card">
        <h3>
          {AREA_COPY.flood.heading} <Tooltip text={tip('area.flood')} />
        </h3>
        <span class="sr-only" role="status">{flood === 'loading' ? AREA_COPY.flood.loading : ''}</span>
        {flood === 'loading' ? (
          <div aria-hidden="true">
            <div class="skeleton sk-line" />
            <div class="skeleton sk-line short" />
          </div>
        ) : flood === 'failed' ? (
          <p class="hint">{AREA_COPY.flood.unavailable}</p>
        ) : flood === 'wales' ? (
          <p>
            {AREA_COPY.flood.walesLead}{' '}
            <ExtLink href={OFFICIAL_LINKS.floodAlertsWales}>{AREA_COPY.flood.walesLink}</ExtLink>
            .
          </p>
        ) : flood.length === 0 ? (
          <>
            <p>{AREA_COPY.flood.none}</p>
            <p class="hint">{COPY.area.floodSource}</p>
          </>
        ) : (
          <>
            <p>
              <strong>{flood.length}</strong>{' '}
              {AREA_COPY.flood.alerts(flood.length)}
            </p>
            <ul class="crime-list">
              {flood.map((a) => (
                <li>
                  {a.name} <span class="hint">({a.severity})</span>
                </li>
              ))}
            </ul>
            <p class="hint">{COPY.area.floodSource}</p>
          </>
        )}
        <p class="hint">
          {AREA_COPY.flood.longTermLead}{' '}
          <ExtLink href={subject.country === 'W92000004' ? OFFICIAL_LINKS.floodRiskWales : OFFICIAL_LINKS.floodRiskEngland}>
            {AREA_COPY.flood.longTermLink(subject.country === 'W92000004' ? AREA_COPY.official.authorityWales : AREA_COPY.official.authorityEngland)}
          </ExtLink>
          .
        </p>
      </div>

      <div class="glass card">
        <h3>{AREA_COPY.official.heading}</h3>
        <ul class="checks-list">
          <li>
            <ExtLink href={subject.country === 'W92000004' ? OFFICIAL_LINKS.floodRiskWales : OFFICIAL_LINKS.floodRiskEngland}>
              {AREA_COPY.official.floodRisk(subject.country === 'W92000004' ? AREA_COPY.official.authorityWales : AREA_COPY.official.authorityEngland)}
            </ExtLink>
          </li>
          <li>
            <ExtLink href={OFFICIAL_LINKS.councilTaxBands}>{AREA_COPY.official.councilTax}</ExtLink>
          </li>
          <li>
            <ExtLink href={OFFICIAL_LINKS.findLocalCouncil}>{AREA_COPY.official.findCouncil}</ExtLink>
          </li>
          <li>
            <ExtLink href={OFFICIAL_LINKS.landRegistrySoldPrices}>{AREA_COPY.official.landRegistry}</ExtLink>
          </li>
        </ul>
        <p class="hint">{AREA_COPY.official.note}</p>
      </div>

      <nav class="glass card area-strip" aria-label={AREA_COPY.analyse.navLabel}>
        <span class="area-strip-label">{AREA_COPY.analyse.label}</span>
        <span class="area-strip-links">
          {strategies.map((s) => (
            <a class="pill" href={`${s.route}/analyser?postcode=${encodeURIComponent(subject.postcode)}`}>{s.name}</a>
          ))}
          <a class="pill" href={`/comparables?postcode=${encodeURIComponent(subject.postcode)}`}>{AREA_COPY.analyse.comparables}</a>
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
        {AREA_COPY.map.heading} <Tooltip text={tip('area.whereSold')} />
      </h3>
      <button
        type="button"
        class="btn-secondary"
        aria-expanded={open}
        aria-controls="area-map-body"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? AREA_COPY.map.hide : AREA_COPY.map.show}
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
    <div class="spark" role="img" aria-label={AREA_COPY.activity.sparkLabel(monthLabel(asOf), counts.join(', '))}>
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

/**
 * The one island: subject form + live results. Everything computes
 * client-side against the public R2 data (and Land Registry's open API,
 * which sends CORS headers — probed live, no proxy needed).
 */
import { useEffect, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import { findComparables, youtubeFor, type ComparablesResult } from '@gil-bricks/core';
import { ComparablesError } from '@gil-bricks/core';
import { fetchSaleHistory, type AddressCandidate } from '@gil-bricks/core';
import { valueProperty, type Valuation } from '@gil-bricks/core';
import { initFromUrl, isCompsReady, isReady, state, type UrlState } from './state';
import { initProvenance, isFromExtension, editedKeys } from './provenance';
import { SubjectForm } from './SubjectForm';
import { BtlVerdict } from './BtlVerdict';
import { StrategySwitcher } from './StrategySwitcher';
import { BrrrrVerdict } from './BrrrrVerdict';
import { FlipVerdict } from './FlipVerdict';
import { HmoVerdict } from './HmoVerdict';
import type { StrategyConfig } from '@gil-bricks/core';

// Verdict island registry — a strategy adds ONE entry here plus its config.
const VERDICTS: Record<string, typeof BtlVerdict> = { BtlVerdict, BrrrrVerdict, FlipVerdict, HmoVerdict };
import { ValuationCard } from './ValuationCard';
import { CompsModule } from './CompsModule';
import { ActionBar } from './ActionBar';

interface Results {
  comps: ComparablesResult | null;
  valuation: Valuation | null;
  candidates: AddressCandidate[] | null;
  lrState: 'ok' | 'timeout' | null;
}

export function AnalyserApp({ strategyName, config = null, showVerdict = true }: { strategyName: string; config?: StrategyConfig | null; showVerdict?: boolean }) {
  const [results, setResults] = useState<Results>({ comps: null, valuation: null, candidates: null, lrState: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  const [, bump] = useState(0);
  const [arrivedDismissed, setArrivedDismissed] = useState(false);

  useEffect(() => {
    initFromUrl();
    initProvenance(typeof window !== 'undefined' ? location.search : '');
    // Strip the arrival metadata from the URL once captured (E11 review): it is
    // read-once, so a link Copied/Shared before the first edit never carries the
    // markers and never falsely shows a recipient the "brought from the extension"
    // state. Provenance for THIS view is already held in memory by initProvenance.
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(location.search);
      if (q.has('src') || q.has('areaSrc')) {
        q.delete('src');
        q.delete('areaSrc');
        const qs = q.toString();
        history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
      }
    }
    let seq = 0;
    const dispose = effect(() => {
      const s = state.value;
      bump((n) => n + 1);
      if (!(showVerdict ? isReady(s) : isCompsReady(s))) return;
      const mySeq = ++seq;
      const run = async () => {
        setBusy(true);
        setError(null);
        setPostcodeError(null);
        try {
          // LR history warms its cache in parallel — valueProperty's own
          // lookup then hits the cache instead of a second round trip
          const historyP = s.paon.trim() !== ''
            ? fetchSaleHistory({ postcode: s.postcode, paon: s.paon, saon: s.saon || undefined }).then(
                (h) => ({ ok: true as const, h }),
                () => ({ ok: false as const, h: null }),
              )
            : Promise.resolve(null);
          const comps = await findComparables({
            postcode: s.postcode,
            radiusMiles: Number(s.radius) as 0.25 | 0.5 | 1,
            periodMonths: Number(s.period) as 6 | 12,
            propertyType: s.ctype,
            tenure: s.tenure,
            age: s.cage,
            minAreaSqm: s.minArea === '' ? undefined : Number(s.minArea),
            maxAreaSqm: s.maxArea === '' ? undefined : Number(s.maxArea),
            minPrice: s.minPrice === '' ? undefined : Number(s.minPrice),
            maxPrice: s.maxPrice === '' ? undefined : Number(s.maxPrice),
            excludedIds: s.excluded === '' ? [] : s.excluded.split(','),
          });
          if (mySeq !== seq) return;

          let valuation: Valuation | null = null;
          let candidates: AddressCandidate[] | null = null;
          let lrState: Results['lrState'] = null;
          // ambiguity check first so the picker can render
          const historyOutcome = await historyP;
          if (historyOutcome !== null) {
            if (historyOutcome.ok && historyOutcome.h) {
              lrState = 'ok';
              if (historyOutcome.h.kind === 'ambiguous') candidates = historyOutcome.h.candidates;
            } else {
              lrState = 'timeout';
            }
          }
          try {
            valuation = await valueProperty({
              postcode: s.postcode,
              paon: s.paon.trim() === '' ? undefined : s.paon,
              saon: s.saon.trim() === '' ? undefined : s.saon,
              floorAreaSqm: s.area === '' ? undefined : Number(s.area),
              comparables: comps,
            });
          } catch (err) {
            // no evidence yet is a state, not an error
            if (!(err instanceof ComparablesError && (err.kind === 'DataUnavailable' || err.kind === 'BadInput'))) throw err;
          }
          if (mySeq !== seq) return;
          setResults({ comps, valuation, candidates, lrState });
        } catch (err) {
          if (mySeq !== seq) return;
          if (err instanceof ComparablesError && err.kind === 'OutsideEnglandWales') {
            setPostcodeError('This tool only has sold-price data for England & Wales, so we can’t analyse Scottish or Northern Irish postcodes.');
          } else if (err instanceof ComparablesError && err.kind === 'UnknownPostcode') {
            setPostcodeError(err.message);
          } else {
            setError('Something went wrong fetching sold prices for this search — it’s usually temporary. Please try again in a moment.');
          }
          setResults({ comps: null, valuation: null, candidates: null, lrState: null });
        } finally {
          if (mySeq === seq) setBusy(false);
        }
      };
      void run();
    });
    return dispose;
  }, []);

  const ready = (showVerdict ? isReady(state.value) : isCompsReady(state.value)) && postcodeError === null;
  // Quiet, one-line confirmation when opened from the extension deep link.
  // Dismisses on the first edit (editedKeys grows) or the ✕ — never nags.
  const showArrived = isFromExtension() && !arrivedDismissed && editedKeys.value.size === 0;
  return (
    <div class="analyser">
      {showArrived && (
        <p class="arrived-note" role="status">
          <span>Brought over from the extension — everything’s filled in below.</span>
          <button type="button" class="arrived-x" aria-label="Dismiss" onClick={() => setArrivedDismissed(true)}>✕</button>
        </p>
      )}
      <section class="glass card">
        <h2>The property</h2>
        <SubjectForm postcodeError={postcodeError} />
      </section>

      {error && (
        <section class="glass card">
          <h3 class="state-h">Couldn’t load the sales data</h3>
          <p class="field-error" role="alert">{error}</p>
        </section>
      )}

      {ready && (
        <>
          <StrategySwitcher
            currentId={config?.id ?? null}
            label={config ? 'Analyse this as…' : 'Analyse this property as…'}
          />
          {showVerdict && (() => {
            const Verdict = config?.verdictSlot ? VERDICTS[config.verdictSlot] : undefined;
            if (Verdict && config) {
              return <Verdict config={config} comps={results.comps} valuation={results.valuation} />;
            }
            return (
              <section class="glass card verdict-slot" aria-label="Strategy verdict">
                <h2>{strategyName} verdict</h2>
                <p class="hint">We haven’t built the verdict for this strategy yet — the sold comparables and valuation below still work.</p>
              </section>
            );
          })()}

          {/* Contextual help, not promotion — a free walkthrough for THIS strategy.
              Config-driven via youtubeFor (coreConfig.youtube), never a pop-up (E10). */}
          {showVerdict && config?.id && (
            <p class="yt-help">
              New to {config.name}?{' '}
              <a
                href={youtubeFor(config.id)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Watch the free walkthrough for ${config.name} on YouTube (opens a new tab)`}
              >
                Watch the free walkthrough →
              </a>
            </p>
          )}

          {busy && results.comps === null ? (
            <SkeletonCards />
          ) : (
            <>
              <ValuationCard valuation={results.valuation} lrState={results.lrState} candidates={results.candidates} />
              <CompsModule result={results.comps} article4={config?.id === 'hmo'} />
              <ActionBar valuation={results.valuation} comps={results.comps} strategyId={config?.id ?? 'comparables'} />
            </>
          )}
        </>
      )}
      {!ready && (
        <p class="hint start-hint">
          {showVerdict
            ? 'Start with the postcode and the asking price, then pick the property type — everything else has sensible defaults you can change.'
            : 'Start with a postcode to see what recently sold nearby.'}
        </p>
      )}
    </div>
  );
}

function SkeletonCards() {
  return (
    <div aria-hidden="true">
      {[1, 2].map(() => (
        <section class="glass card">
          <div class="skeleton sk-title" />
          <div class="skeleton sk-line" />
          <div class="skeleton sk-line" />
          <div class="skeleton sk-line short" />
        </section>
      ))}
    </div>
  );
}

/**
 * The one island: subject form + live results. Everything computes
 * client-side against the public R2 data (and Land Registry's open API,
 * which sends CORS headers — probed live, no proxy needed).
 */
import { useEffect, useState } from 'preact/hooks';
import { COPY } from '../../config/copy';
import { effect } from '@preact/signals';
import { findComparables, getAreaStats, youtubeFor, runComparables, COMPARABLE_RULES, type ComparablesResult, type WidenStage } from '@gil-bricks/core';
import { ComparablesError } from '@gil-bricks/core';
import { fetchSaleHistory, type AddressCandidate } from '@gil-bricks/core';
import { valueProperty, type Valuation } from '@gil-bricks/core';
import { initFromUrl, isCompsReady, isReady, state, type UrlState } from './state';
import { analyserComparables } from '../../lib/comparablesRun';
import { READ_ONCE } from './arrival';
import { initArrivedFacts } from './analyserEvidence';
import { initProvenance, editedKeys } from './provenance';
import { SubjectForm } from './SubjectForm';
import { SubjectLookup } from './SubjectLookup';
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
import { ValuationGate } from './ValuationGate';
import { lookedAt } from './looked';
import { ActionBar } from './ActionBar';
import { features } from '../../config/features';
import { SECTION_STRIP } from '../../config/analyserSections';
import { FloorPlanCard } from './FloorPlanCard';
import { ANALYSER_SHELL } from '../../config/analyserForm';

interface Results {
  comps: ComparablesResult | null;
  valuation: Valuation | null;
  candidates: AddressCandidate[] | null;
  lrState: 'ok' | 'timeout' | null;
  /** The subject sector's sold price PER TYPE — what the valuation caveat is
   *  built from (D4). Null when the companion file could not be read; the
   *  caveat is then simply absent, never guessed. */
  byType: Partial<Record<'D' | 'S' | 'T' | 'F', number | null>> | null;
  /**
   * C1 — WHICH RUNG OF THE LADDER PRODUCED THIS SET, and whether it is still
   * too thin after it. Both come from core's `runComparables`, never inferred
   * from the filters here: the section says what happened, and the valuation
   * refuses on `tooFew`.
   */
  stage: WidenStage;
  tooFew: boolean;
}

export function AnalyserApp({ strategyName, config = null, showVerdict = true }: { strategyName: string; config?: StrategyConfig | null; showVerdict?: boolean }) {
  const [results, setResults] = useState<Results>({ comps: null, valuation: null, candidates: null, lrState: null, byType: null, stage: 'default', tooFew: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  const [, bump] = useState(0);
  const [arrivedDismissed, setArrivedDismissed] = useState(false);

  useEffect(() => {
    initFromUrl();
    initProvenance(typeof window !== 'undefined' ? location.search : '');
    // P7: the fact keys the board sent, so an evidenced input is not shown as a guess.
    initArrivedFacts(typeof window !== 'undefined' ? location.search : '');
    // Strip the arrival metadata from the URL once captured (E11 review): it is
    // read-once, so a link Copied/Shared before the first edit never carries the
    // markers and never falsely shows a recipient the "brought from the extension"
    // state. Provenance for THIS view is already held in memory by initProvenance.
    if (typeof window !== 'undefined') {
      // Read-once metadata, all of it: the extension markers (E11), the deal this
      // page was opened from and the facts behind its numbers (P5.1/P6/P7). A link
      // copied before the first edit must never tell a stranger's page that THEIR
      // numbers are evidenced, or which deal of mine it came from.
      const q = new URLSearchParams(location.search);
      if (READ_ONCE.some((k) => q.has(k))) {
        for (const k of READ_ONCE) q.delete(k);
        const qs = q.toString();
        history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
      }
    }
    let seq = 0;
    // The postcode an error belongs to. Without this, editing SA1 6HW into
    // something incomplete left "We don't know SA1 6HW" on screen naming a
    // postcode that is no longer in the box (D1).
    let erroredFor: string | null = null;
    const dispose = effect(() => {
      const s = state.value;
      bump((n) => n + 1);
      if (erroredFor !== null && erroredFor !== s.postcode) {
        erroredFor = null;
        setPostcodeError(null);
      }
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
          /**
           * C1 — THE SHARED RULES, AND THE ONE WIDENING STEP.
           *
           * `runComparables` is the product's own definition of a comparable,
           * in core, used by every surface: the subject's own type, the last 12
           * months, half a mile — and one deliberate widening step when that is
           * too thin. Nothing here decides any of it; it decides only whether
           * the ladder applies, which it does only while the person has left
           * the radius and the window alone.
           */
          /**
           * C1 — THE ANALYSER'S ASK, which is a named function so that a test
           * can run it side by side with the deal pack's and compare the SETS
           * they produce. See lib/comparablesRun.ts.
           */
          const outcome = await analyserComparables(s);
          const comps = outcome.result;
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
              propertyType: s.type,
              comparables: comps,
            });
          } catch (err) {
            // no evidence yet is a state, not an error
            if (!(err instanceof ComparablesError && (err.kind === 'DataUnavailable' || err.kind === 'BadInput'))) throw err;
          }
          if (mySeq !== seq) return;
          setResults({ comps, valuation, candidates, lrState, byType: null, stage: outcome.stage, tooFew: outcome.tooFew });
          // The per-type sold prices for the subject's own sector, fetched AFTER
          // the cards are on screen — the valuation must never wait on the
          // caveat. A miss is not an error: without it there is simply no type
          // caveat, never a guessed one (D4).
          void getAreaStats(comps.subject.sectorId.split(' ')[0])
            .then((f) => {
              if (mySeq !== seq) return;
              const byType = f[comps.subject.sectorId]?.typicalPriceByType ?? null;
              if (byType) setResults((cur) => ({ ...cur, byType }));
            })
            .catch(() => undefined);
        } catch (err) {
          if (mySeq !== seq) return;
          if (err instanceof ComparablesError && err.kind === 'OutsideEnglandWales') {
            erroredFor = s.postcode;
            setPostcodeError(COPY.analyser.outsideEnglandWales);
          } else if (err instanceof ComparablesError && err.kind === 'UnknownPostcode') {
            erroredFor = s.postcode;
            setPostcodeError(err.message);
          } else {
            setError(COPY.analyser.loadFailed);
          }
          setResults({ comps: null, valuation: null, candidates: null, lrState: null, byType: null, stage: 'default', tooFew: false });
        } finally {
          if (mySeq === seq) setBusy(false);
        }
      };
      void run();
    });
    return dispose;
  }, []);

  // Two different questions: `complete` is "does the analyser have what it needs
  // to score", `ready` adds "and the postcode was accepted". The arrival note is
  // about the FIELDS only — an out-of-area postcode is not a missing field, and
  // telling someone to fill something in would send them looking for nothing
  // (D3 review).
  const complete = showVerdict ? isReady(state.value) : isCompsReady(state.value);
  const ready = complete && postcodeError === null;
  // Quiet, one-line confirmation when opened from the extension deep link.
  /**
   * D5 — the note is ALWAYS in the markup, server and client alike, so it holds
   * its own natural height at every width from the very first paint. An inline
   * script has already stamped `data-arrived` on <html> when the deal came from
   * the extension, and CSS shows it only then. Reserving a fixed pixel height
   * instead would be wrong at three different widths (39px, 62px, 85px).
   *
   * D7 — it must be in the markup on BOTH passes, not "server OR shown". Making
   * it server-only meant a direct visit hydrated a client tree with one fewer
   * leading node than the server sent, Preact re-matched every sibling by
   * position, and the LAST child — the "Start with the postcode…" first-run
   * hint — was dropped from the page entirely. Nobody saw the mismatch because
   * the orphaned note is invisible without `data-arrived`. So the element is
   * unconditional and only its CLASS changes: dismissing it is a tap, and a
   * class swap moves no siblings.
   */
  // Dismisses on the first edit (editedKeys grows) or the ✕ — never nags.
  const arrivedGone = arrivedDismissed || editedKeys.value.size > 0;
  return (
    <div class="analyser">
      <p class={`arrived-note${arrivedGone ? ' is-gone' : ''}`} role="status">
        <span>{complete ? COPY.analyser.fromExtension : COPY.analyser.fromExtensionPartial}</span>
        <button type="button" class="arrived-x" aria-label={ANALYSER_SHELL.dismissArrived} onClick={() => setArrivedDismissed(true)}>✕</button>
      </p>
      <section class="glass card" id="sec-property">
        <h2>{ANALYSER_SHELL.propertyHeading}</h2>
        <SubjectForm postcodeError={postcodeError} />
        {/* E10 — inside the property card, under the address they typed, so it
            can never be mistaken for one of the comparables below. */}
        {features.subjectLookup && <SubjectLookup />}
      </section>

      {error && (
        <section class="glass card">
          <h3 class="state-h">{COPY.analyser.loadFailedTitle}</h3>
          <p class="field-error" role="alert">{error}</p>
        </section>
      )}

      {ready && (
        <>
          {/* (N3) ONE switcher: pinned in the sticky stack when segmentedStrategy
              is on AND this page has the stack (the four analysers), here in the
              page otherwise (/comparables). Never both, never none. */}
          {(!features.segmentedStrategy || config === null) && (
            <StrategySwitcher
              currentId={config?.id ?? null}
              label={config ? ANALYSER_SHELL.switchStrategy : ANALYSER_SHELL.switchStrategyFromComps}
            />
          )}
          {showVerdict && (() => {
            const Verdict = config?.verdictSlot ? VERDICTS[config.verdictSlot] : undefined;
            if (Verdict && config) {
              return (
                <Verdict
                  config={config}
                  comps={results.comps}
                  valuation={results.valuation}
                  beforeVerdict={features.floorPlan ? (
                    /* L1 — between refurb and the verdict: the plan is a thing
                       you change about the property, so it reads with the other
                       inputs and before the answer they produce. */
                    <FloorPlanCard
                      areaSqm={Number(state.value.area) > 0 ? Number(state.value.area) : null}
                      areaSource={new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('areaSrc') ?? 'none'}
                      address={[state.value.paon, state.value.postcode].filter((x) => x !== '').join(' ')}
                    />
                  ) : undefined}
                />
              );
            }
            return (
              <section class="glass card verdict-slot" aria-label={ANALYSER_SHELL.verdictRegionLabel}>
                <h2>{ANALYSER_SHELL.verdictHeading(strategyName)}</h2>
                <p class="hint">{COPY.analyser.noVerdictYet}</p>
              </section>
            );
          })()}

          {/* (N2) The quiet way back up after jumping down the page — one shared
              affordance, so all four strategies get it from this shell. */}
          {showVerdict && features.sectionOverview && (
            <p class="back-to-inputs">
              <a href="#sec-inputs"><span aria-hidden="true">↑</span> {SECTION_STRIP.backToInputs}</a>
            </p>
          )}

          {/* Contextual help, not promotion — a free walkthrough for THIS strategy.
              Config-driven via youtubeFor (coreConfig.youtube), never a pop-up (E10). */}
          {showVerdict && config?.id && (
            <p class="yt-help">
              {ANALYSER_SHELL.youtube.lead(config.name)}{' '}
              <a
                href={youtubeFor(config.id)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={ANALYSER_SHELL.youtube.ariaLabel(config.name)}
              >
                {ANALYSER_SHELL.youtube.link}
              </a>
            </p>
          )}

          {busy && results.comps === null ? (
            <SkeletonCards />
          ) : (
            <>
              {/* The sold data failed to load, and the error card above says so.
                  These two would then ask for a floor area and claim to be
                  "waiting for a postcode" that is right there — three messages,
                  two of them blaming the user for our outage (D3). */}
              {error === null && (
                <>
                  {/* C1 — THE EVIDENCE COMES FIRST. You work through the
                      comparables and satisfy yourself they are right before you
                      are shown a valuation built on them. */}
                  <CompsModule
                    result={results.comps}
                    stage={results.stage}
                    tooFew={results.tooFew}
                    article4={config?.id === 'hmo'}
                    folded={showVerdict}
                  />
                  {/* C1 — THE FIGURE WAITS UNTIL THE EVIDENCE HAS BEEN SEEN.
                      Only where there IS a figure to withhold: an absent
                      valuation already says why, and standing a gate in front
                      of nothing would blame the reader for our missing data. */}
                  {features.comparablesFirst && results.valuation !== null && !lookedAt(state.value) ? (
                    <ValuationGate onGo={() => {
                      const el = typeof document === 'undefined' ? null : document.getElementById('sec-comps');
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      (el?.querySelector('select') as HTMLSelectElement | null)?.focus();
                    }} />
                  ) : (
                    <ValuationCard valuation={results.valuation} lrState={results.lrState} candidates={results.candidates} byType={results.byType} sectorSales={results.comps?.subjectSector?.sales ?? null} />
                  )}
                </>
              )}
              <ActionBar valuation={results.valuation} comps={results.comps} strategyId={config?.id ?? 'comparables'} />
            </>
          )}
        </>
      )}
      {!ready && (
        <p class="hint start-hint">
          {showVerdict ? COPY.analyser.startSubject : COPY.analyser.startComps}
        </p>
      )}
    </div>
  );
}

/**
 * THE LOADING PLACEHOLDERS — and why they now SAY something.
 *
 * These two cards used to be `aria-hidden` with no text at all. That is fine
 * for the half-second they are normally up, and indefensible for the case that
 * actually reached the operator: a sold-price fetch that never settles leaves
 * `busy` true for ever, and the page then shows TWO EMPTY BOX OUTLINES below
 * the refurb section with nothing in them, no message, and nothing for a screen
 * reader either. Two blank rectangles are not a loading state; they read as a
 * broken page, and that is exactly how they were reported.
 *
 * So the first card carries the words, the second stays decorative, and the
 * whole group is a live region.
 */
function SkeletonCards() {
  return (
    <div class="sk-cards" role="status" aria-live="polite">
      <section class="glass card">
        <p class="hint sk-saying">{COPY.analyser.loadingComps}</p>
        <div class="skeleton sk-line" aria-hidden="true" />
        <div class="skeleton sk-line" aria-hidden="true" />
        <div class="skeleton sk-line short" aria-hidden="true" />
      </section>
      <section class="glass card" aria-hidden="true">
        <div class="skeleton sk-title" />
        <div class="skeleton sk-line" />
        <div class="skeleton sk-line" />
        <div class="skeleton sk-line short" />
      </section>
    </div>
  );
}

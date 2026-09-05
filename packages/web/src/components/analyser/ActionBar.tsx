import { useEffect, useRef, useState } from 'preact/hooks';
import { loadMe, openLoginWall, resetMe } from '../../lib/auth/session';
import { dealTitle } from '../../lib/deals/deal';
import { keyFigure } from './keyFigure';
import { verdictSnapshot } from './verdictSnapshot';
import { evidenceSnapshot, isAuctionArrival, isFromExtension } from './provenance';
import { state, strategyParams, toQuery } from './state';
import { fmtMoney, postcodeToSector } from '@gil-bricks/core';
import { features } from '../../config/features';
import { ACTION_BAR } from '../../config/analyserForm';

/** Subject fields whose provenance is worth snapshotting as evidence. */
const EVIDENCE_SUBJECT_KEYS = ['postcode', 'price', 'type', 'area', 'beds', 'baths', 'paon'] as const;
import type { ComparablesResult } from '@gil-bricks/core';
import type { Valuation } from '@gil-bricks/core';

export function ActionBar({ valuation, comps, strategyId }: { valuation: Valuation | null; comps: ComparablesResult | null; strategyId: string }) {
  const [copied, setCopied] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [savedToPipeline, setSavedToPipeline] = useState(false);
  useEffect(() => {
    void loadMe();
  }, []);

  // P4.2 backfill-on-open: a scoreless board card links here with ?backfill=<dealId>.
  // When the score is ready and the user is signed in, silently persist it to THAT
  // deal by id (never creates, never pops the login wall) so the card fills in. Once.
  const backfillId = useRef<string | null>(typeof window === 'undefined' ? null : new URLSearchParams(location.search).get('backfill'));
  const backfilled = useRef(false);
  const snap = verdictSnapshot.value; // subscribe so this re-runs when the score lands
  useEffect(() => {
    const id = backfillId.current;
    if (!id || backfilled.current || !snap || typeof snap.score !== 'number' || !Number.isFinite(snap.score)) return;
    backfilled.current = true;
    void (async () => {
      const v = await loadMe();
      if (v === null) return; // signed out — leave it; don't nag
      await fetch(`/api/deals/${id}/score`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ score: snap.score, verdict_line: snap.headline, headline_figure: snap.boardFigure }),
      }).catch(() => {});
    })();
  }, [snap]);
  // Canonical params from the SIGNALS (same builder as the URL writer) —
  // reactive, and immune to the 250ms replaceState debounce that made
  // location.search stale at click time. A changed analysis is a different
  // deal, so the saved flag resets.
  const currentParams = toQuery(state.value, strategyParams.value).replace(/^\?/, '');
  useEffect(() => {
    setSaveState('idle');
    setSaveNote('');
    setSavedToPipeline(false);
  }, [currentParams]);

  const saveDeal = async () => {
    const v = await loadMe();
    if (v === null) {
      openLoginWall();
      return;
    }
    setSaveState('saving');
    const figure =
      keyFigure.value !== ''
        ? keyFigure.value
        : comps && comps.stats.typicalPrice !== null
          ? `typical ${fmtMoney(comps.stats.typicalPrice)}`
          : '';
    try {
      const pc = postcodeToSector(state.value.postcode);
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          strategy: strategyId,
          title: dealTitle(state.value),
          // click-time canonical params, never the debounced address bar
          url_params: toQuery(state.value, strategyParams.value).replace(/^\?/, ''),
          key_figure: figure,
          // Pipeline verdict snapshot (P2) — the worker uses these only when the
          // dealPipeline flag is on; harmless (ignored) when it's off.
          score: verdictSnapshot.value?.score ?? null,
          criteria_json: verdictSnapshot.value?.criteriaJson ?? '{}',
          // the ONE strategy-appropriate figure the pipeline board card shows (P3)
          headline_figure: verdictSnapshot.value?.boardFigure ?? '',
          // the analyser's verdict line — the board card's reason (P4.1)
          verdict_line: verdictSnapshot.value?.headline ?? '',
          // auction flag (P4) — carried from the extension handoff, warns at Offer in
          is_auction: isAuctionArrival(),
          evidence_json: evidenceSnapshot([...EVIDENCE_SUBJECT_KEYS, ...Object.keys(strategyParams.value)]),
          postcode_sector: pc.inEnglandWales ? pc.sector : '',
          source: isFromExtension() ? 'extension' : 'analyser',
        }),
      });
      if (res.ok) {
        const b = (await res.json().catch(() => ({}))) as { pipeline?: boolean };
        setSavedToPipeline(b.pipeline === true);
        setSaveState('saved');
        setSaveNote('');
      } else if (res.status === 401) {
        // session expired mid-page — refresh auth state and re-wall
        resetMe();
        setSaveState('idle');
        openLoginWall();
      } else if (res.status === 409) {
        setSaveState('idle');
        setSaveNote(((await res.json()) as { error: string }).error);
      } else {
        setSaveState('idle');
        setSaveNote(ACTION_BAR.saveFailed);
      }
    } catch {
      setSaveState('idle');
      setSaveNote(ACTION_BAR.saveFailed);
    }
  };

  const summary = () => {
    const bits: string[] = [];
    if (comps) bits.push(`${comps.subject.postcode}`);
    if (valuation) bits.push(`est ${fmtMoney(valuation.estimate)} (${valuation.range.label})`);
    if (comps && comps.stats.typicalPrice !== null) bits.push(`${comps.stats.count} comps, typical ${fmtMoney(comps.stats.typicalPrice)}`);
    return bits.join(' — ');
  };

  const share = async () => {
    const text = `${summary()} ${location.href}`;
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* fall through */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div class="action-bar">
      <button type="button" class="btn-primary" onClick={share}>{ACTION_BAR.buttons.share}</button>
      <button type="button" class="btn-secondary" onClick={copyLink}>{copied ? ACTION_BAR.buttons.copied : ACTION_BAR.buttons.copyLink}</button>
      {saveState === 'saved' ? (
        <a class="btn-secondary save-done" href="/deals">{savedToPipeline ? ACTION_BAR.saved.inPipeline : ACTION_BAR.saved.inMyDeals}</a>
      ) : (
        <button type="button" class="btn-secondary" disabled={saveState === 'saving'} onClick={saveDeal}>
          {saveState === 'saving' ? ACTION_BAR.buttons.saving : ACTION_BAR.buttons.save}
        </button>
      )}
      {features.pdfExport && (
        <button type="button" class="btn-secondary" disabled aria-describedby="pdf-soon">{ACTION_BAR.buttons.pdf}</button>
      )}
      <span id="pdf-soon" class="hint" role="status">
        {saveState === 'saved' ? (
          savedToPipeline ? (
            <>{ACTION_BAR.hint.pipelineBefore}<a href="/deals">{ACTION_BAR.hint.pipelineLink}</a>{ACTION_BAR.hint.pipelineAfter}</>
          ) : (
            <>{ACTION_BAR.hint.myDealsBefore}<a href="/deals">{ACTION_BAR.hint.myDealsLink}</a>{ACTION_BAR.hint.myDealsAfter}</>
          )
        ) : saveNote !== '' ? (
          saveNote
        ) : features.pdfExport ? (
          ACTION_BAR.hint.pdfSoon
        ) : (
          ''
        )}
      </span>
    </div>
  );
}

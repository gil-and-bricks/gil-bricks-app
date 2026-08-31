import { useEffect, useState } from 'preact/hooks';
import { loadMe, openLoginWall, resetMe } from '../../lib/auth/session';
import { dealTitle } from '../../lib/deals/deal';
import { keyFigure } from './keyFigure';
import { state, strategyParams, toQuery } from './state';
import { fmtMoney } from '../../lib/maths/format';
import type { ComparablesResult } from '../../lib/comparables/engine';
import type { Valuation } from '../../lib/valuation/engine';

export function ActionBar({ valuation, comps, strategyId }: { valuation: Valuation | null; comps: ComparablesResult | null; strategyId: string }) {
  const [copied, setCopied] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  useEffect(() => {
    void loadMe();
  }, []);
  // Canonical params from the SIGNALS (same builder as the URL writer) —
  // reactive, and immune to the 250ms replaceState debounce that made
  // location.search stale at click time. A changed analysis is a different
  // deal, so the saved flag resets.
  const currentParams = toQuery(state.value, strategyParams.value).replace(/^\?/, '');
  useEffect(() => {
    setSaveState('idle');
    setSaveNote('');
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
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          strategy: strategyId,
          title: dealTitle(state.value),
          // click-time canonical params, never the debounced address bar
          url_params: toQuery(state.value, strategyParams.value).replace(/^\?/, ''),
          key_figure: figure,
        }),
      });
      if (res.ok) {
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
        setSaveNote("That didn't save — please try again.");
      }
    } catch {
      setSaveState('idle');
      setSaveNote("That didn't save — please try again.");
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
      <button type="button" class="btn-primary" onClick={share}>Share on WhatsApp</button>
      <button type="button" class="btn-secondary" onClick={copyLink}>{copied ? 'Copied ✓' : 'Copy link'}</button>
      {saveState === 'saved' ? (
        <a class="btn-secondary save-done" href="/account">Saved ✓ — view in My deals</a>
      ) : (
        <button type="button" class="btn-secondary" disabled={saveState === 'saving'} onClick={saveDeal}>
          {saveState === 'saving' ? 'Saving…' : 'Save'}
        </button>
      )}
      <button type="button" class="btn-secondary" disabled aria-describedby="pdf-soon">PDF</button>
      <span id="pdf-soon" class="hint" role="status">
        {saveState === 'saved' ? (
          <>Saved to <a href="/account">My deals</a>.</>
        ) : saveNote !== '' ? (
          saveNote
        ) : (
          'PDF export — coming soon.'
        )}
      </span>
    </div>
  );
}

/**
 * X2 — THE DEAL'S OWN PAGE.
 *
 * The board is a glance: every card the same size, showing the score, the
 * address and the next step. Everything that used to make cards different
 * heights lives here instead, behind one click — including what the listing
 * said and did not say, which the extension read on the portal's page and
 * carried over in the handoff.
 *
 * ── WHY IT READS THE LIST RATHER THAN A NEW ENDPOINT ────────────────────────
 * `/api/deals` already returns the caller's own deals, scoped to them by the
 * same auth the board uses. A new `/api/deals/:id` would be a second read path
 * to the same rows with its own ownership check to get wrong. This finds the
 * one it was asked for and says plainly when it is not there.
 */
import { useCallback, useEffect, useState } from 'preact/hooks';
import { DEAL_PAGE_COPY } from '../../config/dealPage';
import { dealHref } from '../../lib/deals/deal';
import { cardVerdict, nextStepLine, stageMeta, type BoardDeal } from '../../lib/deals/board';
import type { DealFact } from '../../lib/deals/facts';
import { DealDetail } from './DealDetail';

/** The `finds` parameter, read out of the deal's own saved url_params. */
export function findingCodesOf(deal: Pick<BoardDeal, 'url_params'> | null): string | null {
  if (!deal) return null;
  try {
    return new URLSearchParams(deal.url_params ?? '').get('finds');
  } catch {
    return null;
  }
}

/** The deal id this page was asked for. */
export function dealIdFromUrl(search: string): string {
  try {
    return new URLSearchParams(search).get('id')?.trim() ?? '';
  } catch {
    return '';
  }
}

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'missing' }
  | { kind: 'failed' }
  | { kind: 'ready'; deal: BoardDeal };

export function DealPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [facts, setFacts] = useState<DealFact[]>([]);
  const [busy, setBusy] = useState(false);

  /**
   * ONE READ PATH, RE-RUN AFTER EVERY WRITE.
   *
   * The board keeps optimistic copies and rolls them back on failure, because it
   * is a drag-and-drop surface where a stall would be felt. This page is not: a
   * write here is a deliberate act on one deal, and re-reading is the version
   * that CANNOT show a figure the database does not hold.
   */
  const load = useCallback(async (): Promise<void> => {
    const id = dealIdFromUrl(window.location.search);
    if (id === '') { setState({ kind: 'missing' }); return; }
    try {
      const r = await fetch('/api/deals');
      if (r.status === 401) { setState({ kind: 'signed-out' }); return; }
      if (!r.ok) { setState({ kind: 'failed' }); return; }
      const body = (await r.json()) as { deals?: BoardDeal[]; facts?: DealFact[] };
      const deal = (body.deals ?? []).find((d) => d.id === id);
      setFacts((body.facts ?? []).filter((f) => f.deal_id === id));
      setState(deal ? { kind: 'ready', deal } : { kind: 'missing' });
    } catch {
      setState({ kind: 'failed' });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** One writer, so every call gets the same busy handling and the same reread. */
  const write = useCallback(async (path: string, init: RequestInit): Promise<boolean> => {
    setBusy(true);
    try {
      const r = await fetch(path, { headers: { 'content-type': 'application/json' }, ...init });
      if (!r.ok) return false;
      await load();
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [load]);

  if (state.kind === 'loading') return <p class="dp-state">{DEAL_PAGE_COPY.loading}</p>;
  if (state.kind === 'signed-out') {
    return (
      <p class="dp-state">
        {DEAL_PAGE_COPY.signedOut} <a href="/account">{DEAL_PAGE_COPY.signIn}</a>
      </p>
    );
  }
  if (state.kind === 'failed') return <p class="dp-state" role="alert">{DEAL_PAGE_COPY.failed}</p>;
  if (state.kind === 'missing') {
    return (
      <p class="dp-state">
        {DEAL_PAGE_COPY.notFound} <a href="/deals">{DEAL_PAGE_COPY.backToBoard}</a>
      </p>
    );
  }

  const d = state.deal;
  const verdict = cardVerdict(d);
  const step = nextStepLine(d, Date.now());
  const stage = stageMeta(d.stage);

  return (
    <article class="dp">
      <header class="dp-head">
        <h1 class="dp-title">{d.title}</h1>
        <p class="dp-meta">
          {verdict.scored && (
            <span class={`board-score ${verdict.cls}`}>
              <span class="bs-dot" aria-hidden="true">●</span>
              <strong>{(d.current_score as number).toFixed(1)}</strong>
            </span>
          )}
          <span class="pill pill-current">{stage?.label ?? d.stage}</span>
        </p>
        <p class={`dp-verdict ${verdict.scored ? 'v-' + verdict.cls : 'v-unscored'}`}>{verdict.line}</p>
        {step !== '' && <p class="dp-step">{step}</p>}
      </header>

      <DealDetail
        deal={d}
        facts={facts}
        findingCodes={findingCodesOf(d)}
        busy={busy}
        onAddFact={(factType, value, note) =>
          write(`/api/deals/${encodeURIComponent(d.id)}/facts`, {
            method: 'POST',
            body: JSON.stringify({ fact_type: factType, value, note }),
          })}
        onRemoveFact={(factId) =>
          write(`/api/deals/${encodeURIComponent(d.id)}/facts/${encodeURIComponent(factId)}`, { method: 'DELETE' })}
        onSetDate={(key, value) => {
          void write(`/api/deals/${encodeURIComponent(d.id)}/date`, {
            method: 'POST',
            body: JSON.stringify({ key, value }),
          });
        }}
      />

      <p class="dp-actions">
        <a class="btn-action" href={dealHref(d.strategy, d.url_params, undefined, d.id)}>
          {DEAL_PAGE_COPY.openAnalyser}
        </a>
        <a class="dp-back" href="/deals">{DEAL_PAGE_COPY.backToBoard}</a>
      </p>
    </article>
  );
}

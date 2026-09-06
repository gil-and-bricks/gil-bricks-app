/**
 * The pipeline board (P3 + P4) at /deals, behind features.dealPipeline. It answers
 * "what do I need to do today?" and lets the operator ACT without leaving the page:
 *  - a today line names ONE deal + ONE action (board.todayLine).
 *  - every card shows its next step + how long it's waited, and ages stage-aware.
 *  - cards move by drag (desktop) or a native stage picker (keyboard + one-handed
 *    mobile), optimistically with an honest rollback; skipping is allowed.
 *  - quick actions: move, park/kill (one-chip reason), re-open the analyser.
 *  - auction deals surface the legal-pack warning unmissably at Offer in.
 */
import { useEffect, useState } from 'preact/hooks';
import { COPY } from '../../config/copy';
import { loadMe, me, openLoginWall } from '../../lib/auth/session';
import { strategies } from '@gil-bricks/core';
import { features } from '../../config/features';
import { dealHref } from '../../lib/deals/deal';
import { DealFacts } from './DealFacts';
import { applyFacts, factMoves, factNotes, factTypeFor, previousValueFor, type DealFact } from '../../lib/deals/facts';
import { isNews, unseen, type DealChange } from '../../lib/deals/changes';
import { DealChangeNote } from './DealChange';
import { ScoreHistory } from './ScoreHistory';
import { parseStoredEvidence, scoreFromParams } from '../../lib/deals/scoreFromParams';
import { boardCounts, cardVerdict, counterLine, dwellState, nextStepLine, parkedDeals, stageColumns, todayLine, type BoardDeal } from '../../lib/deals/board';
import { ALL_STAGES, BOARD_COPY, CHANGE_COPY, DEAD_STAGE, PARK_REASONS, PROGRESS_STAGES, statusForStage } from '../../config/pipeline';

const strategyBadge = (id: string): string =>
  id === 'comparables' ? BOARD_COPY.card.compsBadge : strategies.find((s) => s.id === id)?.shortName ?? id.toUpperCase();

const STAGE_ORDER = PROGRESS_STAGES.map((s) => s.key);
/** The reason a deal killed by a fact is offered with — chosen in config by key. */
const KILL_REASON = PARK_REASONS.find((r) => r.key === CHANGE_COPY.killReasonKey)?.label ?? '';

export function DealBoard() {
  const [deals, setDeals] = useState<BoardDeal[] | null | 'error'>(null);
  const [cap, setCap] = useState(100);
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const [parkingId, setParkingId] = useState('');
  const [dragId, setDragId] = useState('');
  const [dropStage, setDropStage] = useState('');
  // How many writes are in flight PER DEAL. A count, not a flag: a card with two
  // overlapping writes must stay locked until the last one lands (P5 review).
  const [pending, setPending] = useState<Record<string, number>>({});
  const [showParked, setShowParked] = useState(false);
  /** P5: every fact on every deal, applied in the browser before re-scoring. */
  const [facts, setFacts] = useState<DealFact[]>([]);
  /** P6: the verdict changes nobody has seen yet. They outlive the tab. */
  const [changes, setChanges] = useState<DealChange[]>([]);
  const isBusy = (id: string): boolean => (pending[id] ?? 0) > 0;
  const setBusy = (id: string, on: boolean): void =>
    setPending((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + (on ? 1 : -1)) }));

  const loadBoard = (first: boolean): void => {
    fetch('/api/deals')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((b: { deals: BoardDeal[]; cap: number; facts?: DealFact[]; changes?: DealChange[] }) => {
        setDeals(b.deals);
        setCap(b.cap);
        setFacts(b.facts ?? []);
        setChanges(b.changes ?? []);
      })
      .catch(() => { if (first) setDeals('error'); });
  };

  useEffect(() => {
    void loadMe().then((v) => {
      if (v === null) return;
      loadBoard(true);
    });
    // A deal can change in the OTHER tab — the analyser saves, folds facts in and
    // moves the numbers. Coming back to this tab re-reads the board, so it can
    // never re-score from params the deal no longer has (P6 review).
    if (typeof document === 'undefined') return undefined;
    const onShow = (): void => {
      if (document.visibilityState === 'visible' && me.value) loadBoard(false);
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);

  // ---- optimistic move + honest rollback ----
  // Updates are FUNCTIONAL and keyed by id: they touch only the one deal, so an
  // overlapping move/park on another card can never be clobbered, and a rollback
  // restores exactly that deal's prior stage — nothing else. One write per deal
  // at a time (a card is locked while its write is in flight).
  const moveTo = async (deal: BoardDeal, toStage: string) => {
    if (deal.stage === toStage || !Array.isArray(deals) || isBusy(deal.id)) return;
    const before = { stage: deal.stage, status: deal.status, stage_since: deal.stage_since };
    const stageSince = new Date().toISOString();
    const fromIdx = STAGE_ORDER.indexOf(deal.stage);
    const toIdx = STAGE_ORDER.indexOf(toStage);
    const skipped = fromIdx >= 0 && toIdx > fromIdx + 1;
    setBusy(deal.id, true);
    setDeals((cur) => (Array.isArray(cur) ? cur.map((d) => (d.id === deal.id ? { ...d, stage: toStage, status: statusForStage(toStage), stage_since: stageSince } : d)) : cur));
    setNote(skipped ? { id: deal.id, text: BOARD_COPY.card.skippedStage } : null);
    try {
      const res = await fetch(`/api/deals/${deal.id}/stage`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stage: toStage }),
      });
      if (!res.ok) throw new Error();
      // The card jumps to another column, so say what happened and take the
      // person to it — otherwise the tap looks like nothing at all (D1).
      const label = ALL_STAGES.find((st) => st.key === toStage)?.label ?? toStage;
      setNote(skipped ? { id: deal.id, text: BOARD_COPY.card.skippedStage } : { id: deal.id, text: BOARD_COPY.card.moved(label) });
      requestAnimationFrame(() => document.getElementById(`deal-${deal.id}`)?.scrollIntoView({ block: 'center' }));
    } catch {
      setDeals((cur) => (Array.isArray(cur) ? cur.map((d) => (d.id === deal.id ? { ...d, ...before } : d)) : cur));
      setNote({ id: deal.id, text: BOARD_COPY.card.moveFailed });
    } finally {
      setBusy(deal.id, false);
    }
  };

  const park = async (deal: BoardDeal, reason: string) => {
    if (!Array.isArray(deals) || isBusy(deal.id)) return;
    const before = { stage: deal.stage, status: deal.status, stage_since: deal.stage_since };
    setParkingId('');
    setBusy(deal.id, true);
    setDeals((cur) => (Array.isArray(cur) ? cur.map((d) => (d.id === deal.id ? { ...d, stage: DEAD_STAGE.key, status: 'dead', stage_since: new Date().toISOString() } : d)) : cur));
    try {
      const res = await fetch(`/api/deals/${deal.id}/dead`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error();
      setNote({ id: deal.id, text: BOARD_COPY.card.parked(reason) });
      requestAnimationFrame(() => document.getElementById(`deal-${deal.id}`)?.scrollIntoView({ block: 'center' }));
    } catch {
      setDeals((cur) => (Array.isArray(cur) ? cur.map((d) => (d.id === deal.id ? { ...d, ...before } : d)) : cur));
      setNote({ id: deal.id, text: BOARD_COPY.card.parkFailed });
    } finally {
      setBusy(deal.id, false);
    }
  };

  /** The facts on one deal, oldest first. */
  const factsFor = (dealId: string): DealFact[] => facts.filter((f) => f.deal_id === dealId);

  /**
   * The sold-price band the SAVED score was judged against (P5.1). Re-scoring with
   * it means a fact moves the score for the fact's own reason and nothing else.
   */
  const evidenceFor = (deal: BoardDeal) => parseStoredEvidence(deal.sold_evidence);

  /**
   * A deal saved before we stored the band. A re-score cannot use what the saved
   * score used, so the card says so — and keeps saying so until the deal is saved
   * again, because the drift does not go away when the fact that exposed it does.
   */
  const evidenceUnknown = (deal: BoardDeal): boolean =>
    // ...and only where the strategy actually scores sold prices. An HMO has no
    // such component, so it has nothing to have lost (P6 review).
    (deal.sold_evidence === null || deal.sold_evidence === undefined)
    && (strategies.find((s) => s.id === deal.strategy)?.score ?? []).some((c) => c.key === 'evidence');

  /** The newest fact these params include, so a save folds in only what was here. */
  const factsAsOf = (dealId: string): string | undefined => {
    const applied = factsFor(dealId).filter((f) => f.folded_at === null || f.folded_at === undefined);
    return applied.length === 0 ? undefined : applied.map((f) => f.entered_at).sort().slice(-1)[0];
  };

  /** The deal's params AS THE FACTS LEAVE THEM — this is the truth from now on. */
  const paramsFor = (deal: BoardDeal): string => applyFacts(deal.strategy, deal.url_params, factsFor(deal.id));

  /**
   * P5 — the re-score, run in the BROWSER with @gil-bricks/core. No maths happens
   * here: scoreFromParams makes the same engine calls the analyser makes. It
   * returns what to send WITH the fact, so the fact and the score it caused are
   * one write — a card can never show a score the database does not hold.
   */
  const rescoreBody = (deal: BoardDeal, dealFacts: DealFact[]): Record<string, unknown> | null => {
    const params = applyFacts(deal.strategy, deal.url_params, dealFacts);
    try {
      const scored = scoreFromParams(deal.strategy, params, evidenceFor(deal), deal.room_size_failures ?? null);
      return {
        score: scored.score,
        verdict_line: scored.verdict,
        headline_figure: scored.figure,
        // The snapshot P6 reads: what it was judged against, and what was known.
        // `source` tells P6 which shape this is: a save writes thresholds and
        // assumptions, a fact re-score writes the params it scored.
        criteria_json: JSON.stringify({ source: 'fact-rescore', params }),
        evidence_json: JSON.stringify({ facts: dealFacts.map((f) => ({ type: f.fact_type, value: f.value, at: f.entered_at })) }),
      };
    } catch {
      return null; // not enough inputs to score — the card keeps saying so
    }
  };

  /** Put the re-scored figures on the card, once the server has stored them. */
  const applyScore = (dealId: string, body: Record<string, unknown> | null): void => {
    if (!body) return;
    setDeals((cur) => (Array.isArray(cur)
      ? cur.map((d) => (d.id === dealId
        ? { ...d, current_score: body.score as number, headline_figure: body.headline_figure as string, verdict_line: body.verdict_line as string }
        : d))
      : cur));
  };

  const addFact = async (deal: BoardDeal, factType: string, value: number | null, note: string): Promise<boolean> => {
    if (isBusy(deal.id)) return false; // one write per deal at a time
    setBusy(deal.id, true);
    try {
      const moves = factMoves(factType, deal.strategy);
      // The fact we are about to add, scored the way the analyser would score it.
      const provisional: DealFact = { id: 'pending', deal_id: deal.id, fact_type: factType, value, note, entered_at: new Date().toISOString() };
      const body = moves ? rescoreBody(deal, [...factsFor(deal.id), provisional]) : null;
      // P6 — is the move NEWS? The rules live in config; this only asks them.
      const from = deal.current_score;
      const to = body ? (body.score as number) : null;
      const announce = features.verdictChanges && body !== null && from !== null && to !== null && isNews(from, to)
        ? {
          from_score: from,
          to_score: to,
          previous_value: value === null ? null : previousValueFor(deal.strategy, deal.url_params, factType),
          to_verdict_line: body.verdict_line as string,
        }
        : null;
      const res = await fetch(`/api/deals/${deal.id}/facts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fact_type: factType, value, note, ...(body ?? {}), ...(announce ? { change: announce } : {}) }),
      });
      if (!res.ok) return false;
      const { id, changeId } = (await res.json()) as { id: string; changeId?: string };
      setFacts((cur) => [...cur, { ...provisional, id }]);
      applyScore(deal.id, body);
      if (announce && changeId) {
        setChanges((cur) => [{
          id: changeId, deal_id: deal.id, fact_type: factType, fact_value: value,
          previous_value: announce.previous_value, from_score: announce.from_score, to_score: announce.to_score,
          to_verdict_line: announce.to_verdict_line, at: new Date().toISOString(), acknowledged_at: null,
        }, ...cur]);
      }
      const label = factTypeFor(factType)?.label ?? factType;
      setNote({ id: deal.id, text: body ? BOARD_COPY.card.factAdded(label) : BOARD_COPY.card.factFlagged(label) });
      return true;
    } catch {
      return false;
    } finally {
      setBusy(deal.id, false);
    }
  };

  const removeFact = async (deal: BoardDeal, factId: string): Promise<boolean> => {
    if (isBusy(deal.id)) return false;
    setBusy(deal.id, true);
    try {
      const gone = factsFor(deal.id).find((f) => f.id === factId);
      const left = factsFor(deal.id).filter((f) => f.id !== factId);
      // A fact that moved nothing put no score out of place, so removing it
      // re-scores nothing and never claims it did.
      const moved = gone !== undefined && factMoves(gone.fact_type, deal.strategy);
      const body = moved ? rescoreBody(deal, left) : null;
      const res = await fetch(`/api/deals/${deal.id}/facts/${factId}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) return false;
      setFacts((cur) => cur.filter((f) => f.id !== factId));
      applyScore(deal.id, body);
      setNote({ id: deal.id, text: body ? BOARD_COPY.card.factRemoved : BOARD_COPY.card.factDropped });
      return true;
    } catch {
      return false;
    } finally {
      setBusy(deal.id, false);
    }
  };

  /** P6 — the person has seen it. Marked on the server, so a reload agrees. */
  const dismissChange = async (deal: BoardDeal, changeId: string): Promise<void> => {
    setChanges((cur) => cur.filter((c) => c.id !== changeId));
    await fetch(`/api/deals/${deal.id}/changes/${changeId}/ack`, { method: 'POST' }).catch(() => undefined);
  };

  /**
   * P6 — the deal has fallen below walk-away and the person has TAPPED to park
   * it. Nothing here happens on its own: this runs from their tap, with the
   * reason the numbers already gave.
   */
  const parkKilled = async (deal: BoardDeal, changeId: string): Promise<void> => {
    await dismissChange(deal, changeId);
    await park(deal, KILL_REASON);
  };

  const now = Date.now();
  const v = me.value;

  // Identity FIRST: a signed-out visitor never loads deals, so testing the data
  // before the person left them on a skeleton that could never finish (D1).
  if (v === undefined) {
    return (
      <div class="glass card" aria-hidden="true">
        <div class="skeleton sk-title" />
        <div class="skeleton sk-line" />
      </div>
    );
  }
  if (v === null) {
    return (
      <div class="glass card">
        <h3 class="state-h">{BOARD_COPY.screen.signInHeading}</h3>
        <p class="hint">{COPY.account.dealsSignIn}</p>
        <button type="button" class="btn-primary" onClick={openLoginWall}>{BOARD_COPY.screen.signInButton}</button>
      </div>
    );
  }
  if (deals === null) {
    return (
      <div class="glass card" aria-hidden="true">
        <div class="skeleton sk-title" />
        <div class="skeleton sk-line" />
      </div>
    );
  }
  if (deals === 'error') {
    return <p class="hint" role="alert">{BOARD_COPY.screen.loadFailed}</p>;
  }
  if (deals.length === 0) {
    return (
      <div class="glass card board-empty">
        <h3 class="state-h">{BOARD_COPY.screen.emptyHeading}</h3>
        <p class="hint">{COPY.account.dealsEmpty}</p>
        <p class="hint"><a href="/buy-to-let/analyser">{COPY.account.dealsEmptyCta}</a></p>
      </div>
    );
  }

  const columns = stageColumns(deals);
  const parked = parkedDeals(deals);
  const counts = boardCounts(deals);
  const today = todayLine(deals, now);

  // Card is a render HELPER, invoked as Card({ d }) (not <Card/>), so it doesn't
  // create a child component whose identity changes every render — that would
  // unmount/remount every card on any state change, dropping keyboard focus mid-park
  // and aborting an in-progress drag. Called inline, its DOM is diffed and preserved.
  const Card = ({ d }: { d: BoardDeal }) => {
    const age = dwellState(d, now);
    const verdict = cardVerdict(d);
    const step = nextStepLine(d, now);
    const auctionWarn = d.is_auction && d.stage === 'offer-in';
    const busy = isBusy(d.id);
    return (
      <div
        key={d.id}
        id={`deal-${d.id}`}
        class={`deal-card glass age-${age}${dragId === d.id ? ' dragging' : ''}`}
        draggable={d.status === 'live' && !busy}
        onDragStart={(e) => { setDragId(d.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDragId(''); setDropStage(''); }}
      >
        {/* The link carries the FACT-CORRECTED params: once a quote exists, the
            analyser opens on the quote, not the original guess (P5). */}
        <a class="dc-title" href={dealHref(d.strategy, paramsFor(d), verdict.action === 'score' ? d.id : undefined, d.id, factsAsOf(d.id))}>{d.title}</a>
        <span class="dc-meta">
          {verdict.scored && (
            <span class={`board-score ${verdict.cls}`} aria-label={BOARD_COPY.card.scoreLabel((d.current_score as number).toFixed(1))}>
              <span class="bs-dot" aria-hidden="true">●</span>
              <strong>{(d.current_score as number).toFixed(1)}</strong>
            </span>
          )}
          <span class="pill pill-current dc-strat">{strategyBadge(d.strategy)}</span>
        </span>

        {/* The VERDICT: is it good, and why — the analyser's own line, or an honest
            reason it can't be scored. Never a bare dash. */}
        <p class={`dc-verdict ${verdict.scored ? 'v-' + verdict.cls : 'v-unscored'}`}>{verdict.line}</p>

        {auctionWarn && (
          <p class="dc-auction" role="note">⚠ {COPY.account.auctionWarning}</p>
        )}

        {step !== '' && <p class={`dc-step step-${age}`}>{step}</p>}

        {note && note.id === d.id && <p class="dc-note" role="status">{note.text}</p>}

        {/* P6 — the answer changed. It stays until it has been seen, and it is
            the first thing on the card after the verdict itself. */}
        {features.verdictChanges && unseen(changes, d.id).map((c) => (
          <DealChangeNote
            change={c}
            dealTitle={d.title}
            busy={busy}
            onDismiss={() => void dismissChange(d, c.id)}
            onPark={() => void parkKilled(d, c.id)}
          />
        ))}

        {features.dealFacts && (
          <DealFacts
            dealId={d.id}
            dealTitle={d.title}
            strategy={d.strategy}
            facts={factsFor(d.id)}
            busy={busy}
            onAdd={(t, val, n) => addFact(d, t, val, n)}
            onRemove={(id) => removeFact(d, id)}
          />
        )}

        {features.verdictChanges && verdict.scored && <ScoreHistory dealId={d.id} dealTitle={d.title} />}

        {/* A fact that cannot move this strategy's maths says why, and never
            invents a cost (P5). */}
        {features.dealFacts && evidenceUnknown(d) && d.current_score !== null && (
          <p class="dc-fact-note" role="note">{BOARD_COPY.card.factNoEvidence}</p>
        )}
        {features.dealFacts && factNotes(d.strategy, factsFor(d.id)).map((n) => (
          <p class="dc-fact-note" role="note">{n.label}: {n.note}</p>
        ))}

        {d.status === 'live' && (
          <>
            <div class="dc-actions">
              <label class="dc-move">
                <span class="sr-only">{BOARD_COPY.card.moveLabel(d.title)}</span>
                <select value={d.stage} disabled={busy} onChange={(e) => void moveTo(d, (e.target as HTMLSelectElement).value)}>
                  {PROGRESS_STAGES.map((s) => <option value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <button type="button" class="btn-link dc-park" disabled={busy} onClick={() => setParkingId(parkingId === d.id ? '' : d.id)}>{BOARD_COPY.card.park}</button>
            </div>
            {parkingId === d.id && (
              <div class="dc-park-reasons" role="group" aria-label={BOARD_COPY.card.parkReasonsLabel(d.title)}>
                {PARK_REASONS.map((r) => (
                  <button type="button" class="chip" onClick={() => void park(d, r.label)}>{r.label}</button>
                ))}
                <button type="button" class="chip chip-cancel" onClick={() => setParkingId('')}>{BOARD_COPY.card.keepIt}</button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div class="board">
      <p class={`today-line${today.dealId ? ' today-act' : ''}`} role="status">{today.text}</p>
      <p class="board-count">{counterLine(counts, cap)}</p>

      <div class="board-stages">
        {columns.map((col) => (
          <section
            class={`board-col${dropStage === col.stage.key ? ' drop-target' : ''}`}
            aria-labelledby={`col-${col.stage.key}`}
            onDragOver={(e) => { if (dragId !== '') { e.preventDefault(); setDropStage(col.stage.key); } }}
            onDragLeave={() => setDropStage('')}
            onDrop={(e) => {
              e.preventDefault();
              const d = deals.find((x) => x.id === dragId);
              setDropStage('');
              if (d) void moveTo(d, col.stage.key);
            }}
          >
            <h2 class="board-col-h" id={`col-${col.stage.key}`}>
              {col.stage.label} <span class="board-col-n">{col.deals.length}</span>
            </h2>
            <div class="board-col-cards">
              {col.deals.map((d) => Card({ d }))}
            </div>
          </section>
        ))}
      </div>

      {parked.length > 0 && (
        <section class="board-parked">
          <button type="button" class="board-parked-toggle" aria-expanded={showParked} onClick={() => setShowParked(!showParked)}>
            {DEAD_STAGE.label} <span class="board-col-n">{parked.length}</span>
            <span class="board-parked-caret" aria-hidden="true">{showParked ? '▾' : '▸'}</span>
          </button>
          {showParked && (
            <div class="board-col-cards board-parked-cards">
              {parked.map((d) => Card({ d }))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

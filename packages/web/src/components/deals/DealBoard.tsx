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
import { loadMe, me, openLoginWall } from '../../lib/auth/session';
import { strategies } from '@gil-bricks/core';
import { dealHref } from '../../lib/deals/deal';
import { boardCounts, cardVerdict, counterLine, dwellState, nextStepLine, parkedDeals, stageColumns, todayLine, type BoardDeal } from '../../lib/deals/board';
import { DEAD_STAGE, PARK_REASONS, PROGRESS_STAGES, statusForStage } from '../../config/pipeline';

const strategyBadge = (id: string): string =>
  id === 'comparables' ? 'Comps' : strategies.find((s) => s.id === id)?.shortName ?? id.toUpperCase();

const STAGE_ORDER = PROGRESS_STAGES.map((s) => s.key);

export function DealBoard() {
  const [deals, setDeals] = useState<BoardDeal[] | null | 'error'>(null);
  const [cap, setCap] = useState(100);
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const [parkingId, setParkingId] = useState('');
  const [dragId, setDragId] = useState('');
  const [dropStage, setDropStage] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const setBusy = (id: string, on: boolean) =>
    setPending((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });

  useEffect(() => {
    void loadMe().then((v) => {
      if (v === null) return;
      fetch('/api/deals')
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .then((b: { deals: BoardDeal[]; cap: number }) => {
          setDeals(b.deals);
          setCap(b.cap);
        })
        .catch(() => setDeals('error'));
    });
  }, []);

  // ---- optimistic move + honest rollback ----
  // Updates are FUNCTIONAL and keyed by id: they touch only the one deal, so an
  // overlapping move/park on another card can never be clobbered, and a rollback
  // restores exactly that deal's prior stage — nothing else. One write per deal
  // at a time (a card is locked while its write is in flight).
  const moveTo = async (deal: BoardDeal, toStage: string) => {
    if (deal.stage === toStage || !Array.isArray(deals) || pending.has(deal.id)) return;
    const before = { stage: deal.stage, status: deal.status, stage_since: deal.stage_since };
    const stageSince = new Date().toISOString();
    const fromIdx = STAGE_ORDER.indexOf(deal.stage);
    const toIdx = STAGE_ORDER.indexOf(toStage);
    const skipped = fromIdx >= 0 && toIdx > fromIdx + 1;
    setBusy(deal.id, true);
    setDeals((cur) => (Array.isArray(cur) ? cur.map((d) => (d.id === deal.id ? { ...d, stage: toStage, status: statusForStage(toStage), stage_since: stageSince } : d)) : cur));
    setNote(skipped ? { id: deal.id, text: 'Skipped a stage — your call.' } : null);
    try {
      const res = await fetch(`/api/deals/${deal.id}/stage`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stage: toStage }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setDeals((cur) => (Array.isArray(cur) ? cur.map((d) => (d.id === deal.id ? { ...d, ...before } : d)) : cur));
      setNote({ id: deal.id, text: 'That didn’t move — put back. Try again.' });
    } finally {
      setBusy(deal.id, false);
    }
  };

  const park = async (deal: BoardDeal, reason: string) => {
    if (!Array.isArray(deals) || pending.has(deal.id)) return;
    const before = { stage: deal.stage, status: deal.status, stage_since: deal.stage_since };
    setParkingId('');
    setBusy(deal.id, true);
    setDeals((cur) => (Array.isArray(cur) ? cur.map((d) => (d.id === deal.id ? { ...d, stage: DEAD_STAGE.key, status: 'dead', stage_since: new Date().toISOString() } : d)) : cur));
    try {
      const res = await fetch(`/api/deals/${deal.id}/dead`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setDeals((cur) => (Array.isArray(cur) ? cur.map((d) => (d.id === deal.id ? { ...d, ...before } : d)) : cur));
      setNote({ id: deal.id, text: 'That didn’t save — put back. Try again.' });
    } finally {
      setBusy(deal.id, false);
    }
  };

  const now = Date.now();
  const v = me.value;

  if (v === undefined || deals === null) {
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
        <h3 class="state-h">Sign in to see your pipeline</h3>
        <p class="hint">Your deals live here once you’re signed in — it’s free and takes one tap with Google.</p>
        <button type="button" class="btn-primary" onClick={openLoginWall}>Log in</button>
      </div>
    );
  }
  if (deals === 'error') {
    return <p class="hint" role="alert">Couldn’t load your pipeline just now — refresh the page to retry.</p>;
  }
  if (deals.length === 0) {
    return (
      <div class="glass card board-empty">
        <h3 class="state-h">No deals yet</h3>
        <p class="hint">
          Deals show up here when you analyse a listing — there’s no “add a property” button by design.
          Run one through an <a href="/">analyser</a>, or send one over with the <a href="/extension">extension</a>.
        </p>
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
    const busy = pending.has(d.id);
    return (
      <div
        key={d.id}
        class={`deal-card glass age-${age}${dragId === d.id ? ' dragging' : ''}`}
        draggable={d.status === 'live' && !busy}
        onDragStart={(e) => { setDragId(d.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDragId(''); setDropStage(''); }}
      >
        <a class="dc-title" href={dealHref(d.strategy, d.url_params)}>{d.title}</a>
        <span class="dc-meta">
          {verdict.scored && (
            <span class={`board-score ${verdict.cls}`} aria-label={`Deal score ${(d.current_score as number).toFixed(1)} out of 10`}>
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
          <p class="dc-auction" role="note">⚠ Auction — read the legal pack before you bid. Fees and a fixed completion apply.</p>
        )}

        {step !== '' && <p class={`dc-step step-${age}`}>{step}</p>}

        {note && note.id === d.id && <p class="dc-note" role="status">{note.text}</p>}

        {d.status === 'live' && (
          <>
            <div class="dc-actions">
              <label class="dc-move">
                <span class="sr-only">Move {d.title} to a stage</span>
                <select value={d.stage} disabled={busy} onChange={(e) => void moveTo(d, (e.target as HTMLSelectElement).value)}>
                  {PROGRESS_STAGES.map((s) => <option value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <button type="button" class="btn-link dc-park" disabled={busy} onClick={() => setParkingId(parkingId === d.id ? '' : d.id)}>Park</button>
            </div>
            {parkingId === d.id && (
              <div class="dc-park-reasons" role="group" aria-label={`Why are you parking ${d.title}?`}>
                {PARK_REASONS.map((r) => (
                  <button type="button" class="chip" onClick={() => void park(d, r.label)}>{r.label}</button>
                ))}
                <button type="button" class="chip chip-cancel" onClick={() => setParkingId('')}>Keep it</button>
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
        <details class="board-parked">
          <summary>{DEAD_STAGE.label} <span class="board-col-n">{parked.length}</span></summary>
          <div class="board-col-cards">
            {parked.map((d) => Card({ d }))}
          </div>
        </details>
      )}
    </div>
  );
}

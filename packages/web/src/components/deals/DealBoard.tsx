/**
 * The pipeline board (P3) at /deals — the first user-visible pipeline screen,
 * behind features.dealPipeline. It answers ONE question at a glance: "which of my
 * deals needs me?" Every other property tool is a wall of data; this is not. A
 * card shows only what helps decide the next move — address, Deal Score (with the
 * shared traffic-light colour), strategy, and ONE strategy-appropriate figure.
 *
 * READ-ONLY this sprint: tapping a card re-opens the analyser with the deal's
 * state restored (exactly like re-opening a saved deal). Moving cards between
 * stages is P4. Dead/parked deals are tucked away, not on the live board.
 */
import { useEffect, useState } from 'preact/hooks';
import { loadMe, me, openLoginWall } from '../../lib/auth/session';
import { strategies } from '@gil-bricks/core';
import { dealHref } from '../../lib/deals/deal';
import { cardFigure, parkedDeals, scoreClass, stageColumns, type BoardDeal } from '../../lib/deals/board';
import { DEAD_STAGE } from '../../config/pipeline';

interface BoardResponse {
  pipeline: true;
  deals: BoardDeal[];
  liveCount: number;
  cap: number;
}

const strategyBadge = (id: string): string =>
  id === 'comparables' ? 'Comps' : strategies.find((s) => s.id === id)?.shortName ?? id.toUpperCase();

function Card({ d }: { d: BoardDeal }) {
  const cls = scoreClass(d.current_score);
  const figure = cardFigure(d);
  const scoreLabel = d.current_score === null ? 'not scored yet' : `Deal score ${d.current_score.toFixed(1)} out of 10`;
  return (
    <a class="deal-card glass" href={dealHref(d.strategy, d.url_params)}>
      <span class="dc-title">{d.title}</span>
      <span class="dc-meta">
        <span class={`board-score ${cls}`} aria-label={scoreLabel}>
          <span class="bs-dot" aria-hidden="true">●</span>
          <strong>{d.current_score === null ? '—' : d.current_score.toFixed(1)}</strong>
        </span>
        <span class="pill pill-current dc-strat">{strategyBadge(d.strategy)}</span>
        {figure !== '' && <span class="dc-figure">{figure}</span>}
      </span>
    </a>
  );
}

export function DealBoard() {
  const [data, setData] = useState<BoardResponse | null | 'error'>(null);
  const [showParked, setShowParked] = useState(false);

  useEffect(() => {
    void loadMe().then((v) => {
      if (v === null) return;
      fetch('/api/deals')
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .then((b: BoardResponse) => setData(b))
        .catch(() => setData('error')); // an error must never look like "no deals"
    });
  }, []);

  const v = me.value;
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
        <h3 class="state-h">Sign in to see your pipeline</h3>
        <p class="hint">Your deals live here once you’re signed in — it’s free and takes one tap with Google.</p>
        <button type="button" class="btn-primary" onClick={openLoginWall}>Log in</button>
      </div>
    );
  }
  if (data === null) {
    return (
      <div class="glass card" aria-hidden="true">
        <div class="skeleton sk-line" />
        <div class="skeleton sk-line short" />
      </div>
    );
  }
  if (data === 'error') {
    return <p class="hint" role="alert">Couldn’t load your pipeline just now — refresh the page to retry.</p>;
  }

  const columns = stageColumns(data.deals);
  const parked = parkedDeals(data.deals);

  // No deals at all — deals arrive by analysing a listing; there is deliberately
  // no "add a property" button. Point at the two ways in.
  if (data.deals.length === 0) {
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

  return (
    <div class="board">
      <p class="board-count">{data.liveCount} of {data.cap} live</p>

      <div class="board-stages">
        {columns.map((col) => (
          <section class="board-col" aria-labelledby={`col-${col.stage.key}`}>
            <h2 class="board-col-h" id={`col-${col.stage.key}`}>
              {col.stage.label} <span class="board-col-n">{col.deals.length}</span>
            </h2>
            <div class="board-col-cards">
              {col.deals.map((d) => <Card d={d} />)}
            </div>
          </section>
        ))}
      </div>

      {parked.length > 0 && (
        <details class="board-parked" open={showParked} onToggle={(e) => setShowParked((e.target as HTMLDetailsElement).open)}>
          <summary>{DEAD_STAGE.label} <span class="board-col-n">{parked.length}</span></summary>
          <div class="board-col-cards">
            {parked.map((d) => <Card d={d} />)}
          </div>
        </details>
      )}
    </div>
  );
}

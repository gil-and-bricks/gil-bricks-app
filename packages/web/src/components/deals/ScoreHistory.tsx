/**
 * THE SCORE HISTORY (P6) — a sparkline, not a chart.
 *
 * Every score this deal has held, in order, from the verdict snapshots P5 has
 * been writing since the first fact. It stays CLOSED until it is asked for, so
 * the card keeps saying one thing at a time; opening it shows the line and the
 * steps behind it — the maths, in the same numbers the card has shown all along.
 *
 * The polyline maps a score to a position. It computes no figure: every value
 * here came back from @gil-bricks/core when it was written.
 */
import { useState } from 'preact/hooks';
import { CHANGE_COPY } from '../../config/pipeline';

export interface HistoryPoint {
  score: number;
  at: string;
}

const W = 220;
const H = 34;
const PAD = 3;

/** Score 0-10 → a y position. Geometry, not maths. */
const yOf = (score: number): number => H - PAD - (Math.min(Math.max(score, 0), 10) / 10) * (H - PAD * 2);
const xOf = (i: number, n: number): number => (n < 2 ? W / 2 : PAD + (i / (n - 1)) * (W - PAD * 2));

const day = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export function ScoreHistory({ dealId, dealTitle }: { dealId: string; dealTitle: string }) {
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);

  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next && points === null) {
      fetch(`/api/deals/${dealId}/history`)
        .then((r) => (r.ok ? r.json() : { points: [] }))
        .then((b: { points?: HistoryPoint[] }) => setPoints(b.points ?? []))
        .catch(() => setPoints([]));
    }
  };

  const n = points?.length ?? 0;
  const line = (points ?? []).map((p, i) => `${xOf(i, n)},${yOf(p.score)}`).join(' ');
  const last = n > 0 ? (points as HistoryPoint[])[n - 1] : null;

  return (
    <div class="dc-history">
      <button type="button" class="btn-link dc-history-open" aria-expanded={open} onClick={toggle}>
        {open ? CHANGE_COPY.historyClose : CHANGE_COPY.historyOpen}
      </button>
      {open && (
        <div class="dc-history-body">
          {points === null ? (
            <div class="skeleton sk-line" aria-hidden="true" />
          ) : n === 0 ? (
            <p class="hint">{CHANGE_COPY.historyEmpty}</p>
          ) : n === 1 ? (
            // P12 — ONE POINT IS NOT A HISTORY. This used to draw a sparkline with
            // no line and a single dot, over one step repeating the score already
            // on the card: opening it looked exactly like nothing happening. The
            // board no longer offers the control at all in this case; if an older
            // payload gets here anyway, it says what one point means.
            <p class="hint">{CHANGE_COPY.historyOnce((points as HistoryPoint[])[0].score.toFixed(1))}</p>
          ) : (
            <>
              <svg class="sparkline" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={CHANGE_COPY.historyLabel(dealTitle)}>
                {n > 1 && <polyline points={line} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />}
                {last !== null && <circle cx={xOf(n - 1, n)} cy={yOf(last.score)} r="3" fill="currentColor" />}
              </svg>
              <ol class="dc-history-steps">
                {(points as HistoryPoint[]).map((p, i) => (
                  <li class={i === n - 1 ? 'step-now' : ''}>
                    {i === n - 1
                      ? <strong>{CHANGE_COPY.historyNow(p.score.toFixed(1))}</strong>
                      : CHANGE_COPY.historyPoint(p.score.toFixed(1), day(p.at))}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}

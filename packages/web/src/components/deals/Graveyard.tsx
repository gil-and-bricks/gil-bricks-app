/**
 * DEALS YOU KILLED (P9).
 *
 * Beginners think a dead deal is a failure. Operators know it is filtering that
 * worked — most deals should die, and the ones you kill are the money you did
 * not lose. So this is not a bin: it is the memory, and it is the only place in
 * the product that can tell you something about YOU rather than about a deal.
 *
 * It shows the card AS IT DIED. Nothing here is recomputed: the score, the
 * verdict line, the chips and the facts all come from the snapshot frozen at the
 * moment of death, so a later rules change cannot rewrite history. The words
 * around them are config, so rewording a stage or a reason re-words every
 * headstone.
 *
 * The pattern line speaks only above the threshold and always states its sample
 * — see patternIn(). "Changed my mind" is a legitimate reason and is never
 * judged here.
 */
import { fmtMoney } from '@gil-bricks/core';
import { features } from '../../config/features';
import { GRAVEYARD_COPY } from '../../config/pipeline';
import { scoreClass, stageMeta, type BoardDeal } from '../../lib/deals/board';
import { factTypeFor } from '../../lib/deals/facts';
import { frozenChips, noPatternYet, patternIn, type Headstone } from '../../lib/deals/graveyard';
import { EvidenceChips } from './EvidenceChips';

export interface GraveyardProps {
  stones: readonly Headstone[];
  open: boolean;
  onToggle: () => void;
  /** What the board just said back about a kill or a revival. */
  note: string;
  busy: (dealId: string) => boolean;
  onRevive: (deal: BoardDeal) => void;
}

/**
 * The day it died. A graveyard is kept for years, so a death from another year
 * says which — while this year's stay as short as everywhere else in the app.
 */
const day = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', thisYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
};

/** One headstone: the card as it died, why, and the way back. */
function Stone({ stone, busy, onRevive }: { stone: Headstone; busy: boolean; onRevive: () => void }) {
  const snap = stone.snapshot;
  const score = snap !== null && snap.score !== null ? snap.score.toFixed(1) : null;
  const chips = frozenChips(snap);
  return (
    <li class="headstone glass" id={`dead-${stone.deal.id}`}>
      <p class="hs-title">{snap?.title ?? stone.deal.title}</p>
      <p class="hs-why">
        {stone.reason !== '' && <span class="hs-reason">{stone.reason}</span>}
        <span class="hs-when">{GRAVEYARD_COPY.killed(day(stone.at))}</span>
      </p>
      {stone.note !== '' && <p class="hs-note">{stone.note}</p>}

      {snap === null ? (
        <p class="hs-kept">{GRAVEYARD_COPY.noSnapshot}</p>
      ) : (
        <>
          {/* The stage it reached is part of the frozen card whether or not it ever
              scored — a deal can die before it was ever scoreable (review).
              The score is frozen; its COLOUR is what green/amber/red mean today,
              from the one core source, so the graveyard cannot disagree with the
              rest of the product about what a 6.4 looks like. */}
          <p class="hs-score">
            {score !== null && (
              <span class={`board-score ${scoreClass(snap.score)}`} aria-label={GRAVEYARD_COPY.scoreLabel(score)}>
                <span class="bs-dot" aria-hidden="true">●</span>
                <strong>{score}</strong>
              </span>
            )}
            <span class="hs-stage">{GRAVEYARD_COPY.reached(stageMeta(snap.stage).label)}</span>
          </p>
          {snap.verdictLine !== '' && <p class="hs-verdict">{snap.verdictLine}</p>}
          {/* The chips as they stood — but NOT the line that names the one thing
              that would fix it. This deal is dead: telling someone to go and get
              a builder's number for it would be advice with nowhere to land. */}
          {features.evidenceChips && chips.length > 0 && (
            <EvidenceChips strategy={snap.strategy} chips={chips} score={null} />
          )}
          {snap.facts.length > 0 && (
            <ul class="hs-facts" aria-label={GRAVEYARD_COPY.factsHeading}>
              {snap.facts.map((f) => (
                <li class="hs-fact">
                  {factTypeFor(f.type)?.label ?? f.type}
                  {f.value !== null && <strong> {fmtMoney(f.value)}</strong>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <button type="button" class="btn-link hs-revive" disabled={busy} onClick={onRevive}>
        {GRAVEYARD_COPY.revive}
        <span class="sr-only">{GRAVEYARD_COPY.reviveFor(snap?.title ?? stone.deal.title)}</span>
      </button>
    </li>
  );
}

export function Graveyard({ stones, open, onToggle, note, busy, onRevive }: GraveyardProps) {
  const pattern = patternIn(stones);
  return (
    <section class="board-parked graveyard">
      {note !== '' && <p class="board-note" role="status">{note}</p>}
      <button type="button" class="board-parked-toggle" aria-expanded={open} onClick={onToggle}>
        {GRAVEYARD_COPY.open} <span class="board-col-n">{stones.length}</span>
        <span class="board-parked-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div class="graveyard-body">
          <p class="gy-lead">{GRAVEYARD_COPY.lead}</p>
          {stones.length === 0 ? (
            <p class="hint gy-empty">{GRAVEYARD_COPY.empty}</p>
          ) : (
            <>
              <p class={pattern ? 'gy-pattern' : 'gy-pattern gy-pattern-none'}>
                {pattern ? pattern.line : noPatternYet(stones)}
              </p>
              <ul class="graveyard-list">
                {stones.map((s) => (
                  <Stone stone={s} busy={busy(s.deal.id)} onRevive={() => onRevive(s.deal)} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

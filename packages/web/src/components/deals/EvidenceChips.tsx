/**
 * WHAT THIS SCORE RESTS ON (P7).
 *
 * A small, quiet strip under the Deal Score: one chip per input, filled where it
 * is evidenced, outline where it is only assumed, dashed where nobody knows —
 * then ONE line naming the weakest of them and the single thing that would fix
 * it. Adding a fact fills a chip, which is the point.
 *
 * It is NOT a second score: nothing here is weighted or totalled, and every
 * state comes back from @gil-bricks/core, which the analyser and the extension
 * panel read too.
 *
 * Two ways in, ONE renderer (P9): a live deal passes what it knows now, and a
 * dead one passes the chips exactly as they stood when it died. A frozen strip
 * must look like the strip it froze, so there is no second component for it.
 */
import { evidenceChips, evidenceSentence, type EvidenceChip, type EvidenceInputs, type StrategyId } from '@gil-bricks/core';
import { EVIDENCE_COPY } from '../../config/evidence';

export interface EvidenceChipsProps {
  strategy: string;
  /** What this surface knows now. Ignored when `chips` is given. */
  inputs?: EvidenceInputs;
  /** Chips already decided — the frozen set on a dead deal (P9). */
  chips?: readonly EvidenceChip[];
  /** The score this evidence sits under, already formatted. Null hides the line. */
  score: string | null;
}

export function EvidenceChips({ strategy, inputs, chips, score }: EvidenceChipsProps) {
  const list = chips ?? evidenceChips(strategy as StrategyId, inputs ?? {});
  if (list.length === 0) return null;
  const sentence = score === null ? '' : evidenceSentence(score, list);
  return (
    <div class="ev-block">
      <ul class="ev-chips" aria-label={EVIDENCE_COPY.stripLabel}>
        {list.map((c) => (
          <li class={`ev-chip ev-${c.state}`}>
            <span class="sr-only">{EVIDENCE_COPY.chipLabel(c.label, EVIDENCE_COPY.states[c.state])}</span>
            <span aria-hidden="true">{c.label}</span>
          </li>
        ))}
      </ul>
      {sentence !== '' && <p class="ev-line">{sentence}</p>}
    </div>
  );
}

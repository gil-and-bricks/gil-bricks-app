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
import { CHIP_SPECS, chipIsFixable, evidenceChips, evidenceSentence, factForChip, type EvidenceChip, type EvidenceInputs, type StrategyId } from '@gil-bricks/core';
import { EVIDENCE_COPY } from '../../config/evidence';

export interface EvidenceChipsProps {
  strategy: string;
  /** What this surface knows now. Ignored when `chips` is given. */
  inputs?: EvidenceInputs;
  /** Chips already decided — the frozen set on a dead deal (P9). */
  chips?: readonly EvidenceChip[];
  /** The score this evidence sits under, already formatted. Null hides the line. */
  score: string | null;
  /**
   * P12 — PRESS A CHIP TO FIX WHAT IT NAMES. Given, a chip that a fact could
   * fill becomes a button that opens the fact picker on that fact. Omitted (the
   * analyser, a dead deal's frozen strip) and every chip stays inert, exactly as
   * before: a chip is only ever pressable where something can be recorded.
   */
  onFix?: (factType: string, chip: EvidenceChip) => void;
}

export function EvidenceChips({ strategy, inputs, chips, score, onFix }: EvidenceChipsProps) {
  const list = chips ?? evidenceChips(strategy as StrategyId, inputs ?? {});
  if (list.length === 0) return null;
  const sentence = score === null ? '' : evidenceSentence(score, list);
  return (
    <div class="ev-block">
      {/* When the strip is interactive its chips are TOUCH TARGETS, so the whole
          row grows to 44px and stays one even height — a 27px button is not a
          target on a phone, and a row of mixed heights reads as an accident.
          Without a handler (the analyser, a dead deal) nothing changes. */}
      <ul class={onFix === undefined ? 'ev-chips' : 'ev-chips ev-chips-fixable'} aria-label={EVIDENCE_COPY.stripLabel}>
        {list.map((c) => {
          const factType = onFix === undefined ? null : (chipIsFixable(c) ? factForChip(c.key) : null);
          // Not pressable: no <button>, no pointer, nothing that reads as an
          // offer. A chip that cannot be fixed must not look as though it can.
          if (factType === null) {
            return (
              <li class={`ev-chip ev-${c.state}`}>
                <span class="sr-only">{EVIDENCE_COPY.chipLabel(c.label, EVIDENCE_COPY.states[c.state])}</span>
                <span aria-hidden="true">{c.label}</span>
              </li>
            );
          }
          return (
            <li>
              <button
                type="button"
                class={`ev-chip ev-${c.state} ev-fix`}
                aria-label={EVIDENCE_COPY.fixLabel(c.label, EVIDENCE_COPY.states[c.state], CHIP_SPECS[c.key].action)}
                onClick={() => onFix?.(factType, c)}
              >
                <span aria-hidden="true">{c.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {sentence !== '' && <p class="ev-line">{sentence}</p>}
    </div>
  );
}

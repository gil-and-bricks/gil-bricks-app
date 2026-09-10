/**
 * Adding a fact, and seeing the ones a deal already has (P5).
 *
 * BUILT FOR A HALLWAY. Two taps and one number: tap "What happened?", tap the
 * thing that happened, type the figure, save. Everything is full-width and at
 * least 44px tall so it works one-handed at 390px.
 *
 * The re-score is NOT here — this component reports the fact and the parent
 * board re-runs @gil-bricks/core. One pathway into the maths.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { fmtMoney } from '@gil-bricks/core';
import { BOARD_COPY, FACT_TYPES } from '../../config/pipeline';
import { factMoves, factTypeFor, type DealFact } from '../../lib/deals/facts';

/** UI states — identifiers, never shown. */
const STATE = { closed: 'closed', picking: 'picking', typing: 'typing', saving: 'saving' } as const;
type State = (typeof STATE)[keyof typeof STATE];

export interface FactsProps {
  dealId: string;
  dealTitle: string;
  strategy: string;
  facts: readonly DealFact[];
  /** Stores the fact, then re-scores. Resolves false if it did not save. */
  onAdd: (factType: string, value: number | null, note: string) => Promise<boolean>;
  onRemove: (factId: string) => Promise<boolean>;
  busy: boolean;
  /**
   * The pipeline ends at purchase: a bought or parked deal takes no NEW facts.
   * The list itself always stays — it is the record of what you bought on, and
   * hiding it was the very thing the guard meant to protect (D3 review).
   */
  canAdd: boolean;
  /**
   * P12 — OPEN STRAIGHT ONTO ONE FACT. An evidence chip names a weak input, so
   * pressing it should land on the form for the fact that fixes it, not on the
   * list of ten. The parent sets this to a fact-type key; the sheet opens on it
   * and calls `onOpened` so it is a one-shot, never a state that re-opens itself.
   */
  openWith?: string;
  onOpened?: () => void;
}

const dayOf = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export function DealFacts({ dealId, dealTitle, strategy, facts, onAdd, onRemove, busy, canAdd, openWith, onOpened }: FactsProps) {
  const [state, setState] = useState<State>(STATE.closed);
  const saving = state === STATE.saving;
  const [picked, setPicked] = useState('');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The keyboard must be up the moment the number field appears — one tap, one
  // number, done. `autofocus` does nothing on a node added after page load.
  const field = useRef<HTMLInputElement>(null);
  // Where focus goes when the sheet closes, so a save never drops you on <body>.
  const opener = useRef<HTMLButtonElement>(null);
  // A save in flight belongs to the sheet that started it. Cancel bumps this, so
  // a late failure cannot reopen a form for a fact type nobody has picked.
  const attempt = useRef(0);
  useEffect(() => {
    if (state === STATE.typing) field.current?.focus();
  }, [state, picked]);

  const type = picked === '' ? undefined : factTypeFor(picked);
  // A flag saves straight from the chip list; a number saves from the form it was
  // typed into, and that form STAYS ON SCREEN while it saves.
  const savingFlag = saving && type?.kind === 'flag';
  // Where an added cost turns up in the analyser, so nothing there is a surprise.
  const lands = type?.applies?.[strategy]?.shownAs;
  const reset = (): void => {
    attempt.current += 1;
    setState(STATE.closed);
    setPicked('');
    setValue('');
    setNote('');
    setError(null);
  };

  const choose = (key: string): void => {
    const chosen = factTypeFor(key);
    // SWITCHING FACT ABANDONS THE OLD ONE COMPLETELY (P12). Pressing a second
    // evidence chip while the form is half-filled used to re-label the form and
    // keep the number: £42,000 typed as a builder's quote could be saved as the
    // agreed monthly rent, and the deal re-scored on it. Bumping `attempt` also
    // disowns any save still in flight for the fact being left, so its late
    // reply cannot reopen a form or report a failure against the new one.
    attempt.current += 1;
    setPicked(key);
    setValue('');
    setNote('');
    setError(null);
    // A flag carries no number, so there is nothing to type: save it now.
    if (chosen?.kind === 'flag') {
      const mine = attempt.current;
      setState(STATE.saving);
      void onAdd(key, null, '').then((ok) => {
        if (mine !== attempt.current) return; // cancelled while it was in flight
        if (ok) { reset(); opener.current?.focus(); return; }
        setError(BOARD_COPY.card.factFailed);
        setState(STATE.picking);
      });
      return;
    }
    setState(STATE.typing);
  };

  const save = (): void => {
    const n = Number(value);
    if (value.trim() === '' || !Number.isFinite(n) || n < 0) {
      setError(BOARD_COPY.card.factNeedsNumber); // say what is wrong, not just that it failed
      field.current?.focus();
      return;
    }
    const mine = attempt.current;
    setState(STATE.saving);
    void onAdd(picked, Math.round(n), note.trim()).then((ok) => {
      if (mine !== attempt.current) return; // cancelled while it was in flight
      if (ok) { reset(); opener.current?.focus(); return; }
      setError(BOARD_COPY.card.factFailed);
      setState(STATE.typing);
    });
  };

  // A chip was pressed: open the sheet on that fact and hand the request back.
  // Nothing happens on a deal that cannot take facts — the chip is not pressable
  // there either, so this is a second lock on the same door.
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openWith === undefined || openWith === '' || !canAdd) return;
    if (factTypeFor(openWith) === undefined) return; // a key nothing knows: ignore it
    choose(openWith);
    onOpened?.();
    requestAnimationFrame(() => sheet.current?.scrollIntoView({ block: 'nearest' }));
  }, [openWith, canAdd]);

  return (
    <div class="dc-facts" ref={sheet}>
      {facts.length > 0 && (
        <ul class="fact-list" aria-label={BOARD_COPY.card.factsListHeading}>
          {facts.map((f) => {
            const t = factTypeFor(f.fact_type);
            const moves = factMoves(f.fact_type, strategy);
            // A folded fact is already IN the deal's numbers: it is the record of
            // why the deal moved, so it stays visible, but removing it could not
            // put anything back (P6 review).
            const folded = (f.folded_at ?? null) !== null;
            return (
              <li class={`fact-row${moves ? '' : ' fact-flagged'}${folded ? ' fact-folded' : ''}`}>
                <span class="fact-what">
                  {t?.label ?? f.fact_type}
                  {f.value !== null && f.value !== undefined && <strong> {fmtMoney(f.value)}</strong>}
                </span>
                <span class="fact-when">{folded ? BOARD_COPY.card.factFolded : BOARD_COPY.card.factOn(dayOf(f.entered_at))}</span>
                {(f.note ?? '').trim() !== '' && <span class="fact-note">{f.note}</span>}
                {!folded && canAdd && (
                  <button
                    type="button"
                    class="btn-link fact-remove"
                    disabled={busy}
                    aria-label={BOARD_COPY.card.factRemoveLabel(t?.label ?? f.fact_type)}
                    onClick={() => void onRemove(f.id).then((ok) => { if (!ok) setError(BOARD_COPY.card.factFailed); })}
                  >
                    {BOARD_COPY.card.factRemove}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error !== null && state === STATE.closed && <p class="field-error" role="alert">{error}</p>}

      {!canAdd ? null : state === STATE.closed ? (
        <button type="button" class="btn-link dc-facts-open" ref={opener} disabled={busy} onClick={() => setState(STATE.picking)}>
          {BOARD_COPY.card.factsOpen}
        </button>
      ) : (
        <div class="fact-sheet" role="group" aria-label={BOARD_COPY.card.factsHeading(dealTitle)}>
          {state === STATE.picking || savingFlag ? (
            <div class="fact-choices">
              {FACT_TYPES.map((t) => (
                <button type="button" class="chip fact-choice" disabled={saving} onClick={() => choose(t.key)}>
                  {t.label}
                </button>
              ))}
              <button type="button" class="chip chip-cancel" onClick={reset}>{BOARD_COPY.card.factCancel}</button>
            </div>
          ) : (
            <div class="fact-entry">
              <label for={`fact-value-${dealId}`}>{type?.numberLabel}</label>
              <input
                id={`fact-value-${dealId}`}
                type="number"
                inputMode="numeric"
                min="0"
                step="100"
                value={value}
                ref={field}
                onInput={(e) => setValue((e.target as HTMLInputElement).value)}
              />
              {type?.hint !== undefined && <p class="field-hint">{lands === undefined ? type.hint : `${type.hint} ${BOARD_COPY.card.factLandsIn(lands)}`}</p>}
              <label for={`fact-note-${dealId}`} class="fact-note-label">{BOARD_COPY.card.factNoteLabel}</label>
              <input
                id={`fact-note-${dealId}`}
                type="text"
                maxLength={200}
                value={note}
                onInput={(e) => setNote((e.target as HTMLInputElement).value)}
              />
              <div class="fact-actions">
                <button type="button" class="btn-primary" disabled={saving} onClick={save}>
                  {saving ? BOARD_COPY.card.factSaving : BOARD_COPY.card.factSave}
                </button>
                <button type="button" class="btn-secondary" onClick={reset}>{BOARD_COPY.card.factCancel}</button>
              </div>
            </div>
          )}
          {error !== null && <p class="field-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}

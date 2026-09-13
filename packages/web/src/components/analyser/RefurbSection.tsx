/**
 * THE REFURB SECTION (R1) — the one number that moves a flip, with its working.
 *
 * WHAT IT REPLACED: a "Refurb needed: None / Light / Moderate / Heavy" dropdown
 * that no calculation ever read, sitting beside a bare `refurbCost` box with no
 * working at all. The adjective is gone; this is the box plus its arithmetic.
 *
 * NOBODY IS FORCED THROUGH THE LIST. The section opens as one money field and a
 * closed disclosure. Someone holding a builder's quote types it and moves on,
 * exactly as before. The fourteen rows exist for the person who has not got a
 * quote yet and is guessing — which is the person the old dropdown failed.
 *
 * NO MATHS HERE. The sum, and which number is in charge, come from
 * @gil-bricks/core (charter rule 3). This ticks boxes and formats pounds.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { REFURB_MODE, fmtMoney, refurbMode, refurbTotal, sumRefurbLines, type RefurbLine } from '@gil-bricks/core';

import { REFURB, REFURB_ITEMS, paramFor } from '../../config/refurb';
import { REFURB_FIGURES_LABEL, figureFor, hasAnyFigure } from '../../config/refurbFigures';
import { MoneyInput } from './MoneyInput';
import { strategyParams, updateStrategy } from './state';
import { markEdited } from './provenance';

/** The param that says "the list is in charge", so an outside write to the
 * total (a builder's quote) is distinguishable from the list's own sum. */
export const MODE_PARAM = 'rfList';

/** Every param this section owns — registered so the URL hydrates them. */
export function refurbParamKeys(): string[] {
  return [MODE_PARAM, ...REFURB_ITEMS.map((i) => paramFor(i.key))];
}

const numOf = (raw: string | undefined): number => {
  const n = Number(raw);
  return Number.isFinite(n) && raw !== '' && raw !== undefined ? n : 0;
};

/** The lines as the page holds them: ticked when the param has any value. */
export function linesFrom(params: Record<string, string>): RefurbLine[] {
  return REFURB_ITEMS.map((item) => {
    const raw = params[paramFor(item.key)];
    return { key: item.key, ticked: raw !== undefined && raw !== '', amount: numOf(raw) };
  });
}

export function RefurbSection({ legacy, onLegacySeen }: { legacy: boolean; onLegacySeen: () => void }) {
  const p = strategyParams.value;
  const lines = linesFrom(p);
  const listInCharge = (p[MODE_PARAM] ?? '') === '1';
  const storedRaw = p[REFURB.fieldKey] ?? '';
  const stored = storedRaw === '' ? null : numOf(storedRaw);
  // Only a list that CLAIMS to be in charge can be superseded; a list nobody
  // switched on is simply not the source of the figure.
  const mode = listInCharge ? refurbMode(lines, stored) : REFURB_MODE.typed;
  const sum = sumRefurbLines(lines);
  const tickedCount = lines.filter((l) => l.ticked).length;
  const [open, setOpen] = useState(false);
  const focusNext = useRef<string | null>(null);

  // Ticking a row puts the cursor in its box: typing a figure is one tap away.
  useEffect(() => {
    if (focusNext.current === null) return;
    const el = document.getElementById(`rf-amt-${focusNext.current}`);
    focusNext.current = null;
    if (el instanceof HTMLInputElement) el.focus();
  });

  /**
   * A ROW CHANGE WRITES THE ROW AND THE TOTAL IN ONE GO, and that atomicity is
   * the whole mechanism. `refurbCost` is the only param the score reads, so the
   * list's sum has to land there — and if it landed a moment later, the person's
   * own keystroke would look exactly like an outside write and the section would
   * accuse a builder's quote that had not happened. Written together, the two
   * can only ever disagree because something ELSE moved the total.
   */
  const writeLines = (next: RefurbLine[], extra: Record<string, string> = {}): void => {
    const stillTicked = next.some((l) => l.ticked);
    updateStrategy({
      ...extra,
      [MODE_PARAM]: stillTicked ? '1' : '',
      // Unticking the last row hands the figure back: the total becomes typed
      // again and KEEPS the number it had, rather than dropping to £0.
      ...(stillTicked ? { [REFURB.fieldKey]: String(sumRefurbLines(next)) } : {}),
    });
    markEdited(REFURB.fieldKey);
  };

  const setLine = (key: string, raw: string): void => {
    const amount = numOf(raw);
    writeLines(lines.map((l) => (l.key === key ? { ...l, ticked: true, amount } : l)),
      { [paramFor(key)]: raw === '' ? '0' : raw });
  };

  const toggle = (key: string, on: boolean): void => {
    if (on) focusNext.current = key;
    writeLines(lines.map((l) => (l.key === key ? { ...l, ticked: on, amount: on ? l.amount : 0 } : l)),
      { [paramFor(key)]: on ? String(lines.find((l) => l.key === key)?.amount ?? 0) : '' });
  };

  const displayTotal = refurbTotal(lines, stored);

  return (
    <section class="refurb" id={REFURB.sectionId} aria-labelledby="refurb-h">
      <h3 id="refurb-h">{REFURB.copy.heading}</h3>
      <p class="hint">{REFURB.copy.lead}</p>

      {legacy && (
        <p class="refurb-legacy" role="status">
          {REFURB.copy.legacy}{' '}
          <button type="button" class="link-btn" onClick={onLegacySeen}>{REFURB.copy.legacyDismiss}</button>
        </p>
      )}

      <div class="field refurb-total">
        <label for={`sf-${REFURB.fieldKey}`}>{REFURB.copy.totalLabel} (£)</label>
        {mode === REFURB_MODE.typed ? (
          <MoneyInput
            id={`sf-${REFURB.fieldKey}`}
            value={storedRaw}
            onValue={(raw) => updateStrategy({ [REFURB.fieldKey]: raw })}
            onEdited={() => markEdited(REFURB.fieldKey)}
          />
        ) : (
          <output id={`sf-${REFURB.fieldKey}`} class="refurb-derived">{fmtMoney(displayTotal)}</output>
        )}
        {mode === REFURB_MODE.itemised && <p class="field-hint">{REFURB.copy.listInCharge}</p>}
        {mode === REFURB_MODE.superseded && (
          <p class="field-hint refurb-superseded" role="status">
            {REFURB.copy.superseded(fmtMoney(displayTotal))} {REFURB.copy.supersededWhy}
          </p>
        )}
      </div>

      <button
        type="button"
        class="refurb-toggle"
        aria-expanded={open}
        aria-controls="refurb-list"
        onClick={() => setOpen(!open)}
      >
        {open ? REFURB.copy.breakdownOpen : REFURB.copy.breakdown}
        {tickedCount > 0 && <span class="refurb-count"> · {REFURB.copy.sumLine(tickedCount, fmtMoney(sum))}</span>}
      </button>

      <div id="refurb-list" class="refurb-list" hidden={!open}>
        {!hasAnyFigure() && <p class="hint refurb-waiting">{REFURB.copy.figuresEmpty}</p>}
        {hasAnyFigure() && <p class="hint refurb-mine">{REFURB_FIGURES_LABEL}</p>}
        <ul class={`refurb-rows${mode === REFURB_MODE.superseded ? ' is-superseded' : ''}`}>
          {REFURB_ITEMS.map((item) => {
            const line = lines.find((l) => l.key === item.key);
            const ticked = line?.ticked === true;
            const suggestion = figureFor(item.key);
            return (
              <li class={`refurb-row${ticked ? ' is-on' : ''}`} key={item.key}>
                <label class="refurb-tick" for={`rf-${item.key}`}>
                  <input
                    type="checkbox"
                    id={`rf-${item.key}`}
                    checked={ticked}
                    onChange={(e) => toggle(item.key, (e.target as HTMLInputElement).checked)}
                  />
                  <span class="refurb-name">{item.label}</span>
                  {ticked && <span class="refurb-amt-shown">{fmtMoney(line?.amount ?? 0)}</span>}
                </label>
                {item.hint && !ticked && <p class="refurb-hint">{item.hint}</p>}
                {ticked && (
                  <div class="refurb-amount">
                    <label class="sr-only" for={`rf-amt-${item.key}`}>{REFURB.copy.amountLabel(item.label)}</label>
                    <MoneyInput
                      id={`rf-amt-${item.key}`}
                      value={line?.amount === 0 ? '' : String(line?.amount ?? '')}
                      onValue={(raw) => setLine(item.key, raw === '' ? '0' : raw)}
                    />
                    {suggestion !== null && (
                      <button type="button" class="refurb-suggest" onClick={() => setLine(item.key, String(suggestion))}>
                        {fmtMoney(suggestion)}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p class="refurb-sum">
          {tickedCount === 0
            ? REFURB.copy.nothingTicked
            : `${REFURB.copy.sumLabel}: ${REFURB.copy.sumLine(tickedCount, fmtMoney(sum))}`}
        </p>
      </div>
    </section>
  );
}

/**
 * C1 — WHAT STANDS WHERE THE VALUATION WOULD BE, UNTIL THE COMPARABLES HAVE
 * BEEN LOOKED AT.
 *
 * It says the one thing somebody needs to know to understand why there is no
 * figure yet — that the end value depends on which sold sales it is compared
 * against — and then offers the single press that takes them there. It does not
 * explain the gate, apologise for it, or teach comparables; the list itself is
 * where that happens.
 *
 * THE HEADING STAYS. The card keeps its title and its place on the page, so the
 * section does not appear and disappear under somebody scrolling.
 */
import { COPY } from '../../config/copy';

export function ValuationGate({ onGo }: { onGo: () => void }) {
  const G = COPY.valuation.reviewGate;
  return (
    <section class="glass card" id="valuation" aria-labelledby="val-h">
      <h2 id="val-h">{COPY.valuation.title}</h2>
      <div class="val-gate" role="status">
        <p class="val-gate-line">{G.line}</p>
        <p class="hint">{G.why}</p>
        <button type="button" class="btn-action" onClick={onGo}>{G.cta}</button>
      </div>
    </section>
  );
}

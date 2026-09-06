/**
 * THE ANSWER CHANGED (P6).
 *
 * The most valuable sentence this product says: what the deal was, what landed,
 * what it is now, what that means and what would fix it. The last part is
 * @gil-bricks/core's own verdict line, stored at the moment of the change, so it
 * can never drift from the maths. Nothing here computes anything.
 *
 * It stays until it is dismissed — a change nobody has seen is not news that has
 * been delivered.
 */
import { CHANGE_COPY } from '../../config/pipeline';
import { changeLine, type DealChange } from '../../lib/deals/changes';

export interface ChangeProps {
  change: DealChange;
  dealTitle: string;
  busy: boolean;
  /** Marks it seen. */
  onDismiss: () => void;
  /** Offered ONLY when the deal has fallen below walk-away, and never automatic. */
  onPark: () => void;
}

export function DealChangeNote({ change, dealTitle, busy, onDismiss, onPark }: ChangeProps) {
  const line = changeLine(change);
  return (
    <div class={`dc-change ${line.better ? 'change-better' : 'change-worse'}`} role="status">
      <p class="dc-change-h">{CHANGE_COPY.heading}</p>
      <p class="dc-change-line">{line.was} {line.moves}</p>
      {line.verdict !== '' && <p class="dc-change-verdict">{line.verdict}</p>}
      {line.killed && <p class="dc-change-kill">{CHANGE_COPY.killOffer}</p>}
      <div class="dc-change-actions">
        {line.killed && (
          <button type="button" class="btn-secondary dc-change-park" disabled={busy} aria-label={CHANGE_COPY.killParkLabel(dealTitle)} onClick={onPark}>
            {CHANGE_COPY.killPark}
          </button>
        )}
        <button type="button" class="btn-link dc-change-ok" disabled={busy} aria-label={CHANGE_COPY.dismissLabel(dealTitle)} onClick={onDismiss}>
          {CHANGE_COPY.dismiss}
        </button>
      </div>
    </div>
  );
}

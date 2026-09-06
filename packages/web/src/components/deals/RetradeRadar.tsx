/**
 * THE RE-TRADE RADAR (P11).
 *
 * A survey finding or a down-valuation is the moment the price stops being the
 * price. This answers the only question worth asking — what is it worth to me
 * NOW — with the reverse solve, and hands over words to paste into an email.
 *
 * IT COPIES; IT NEVER SENDS. Nothing in this product sends anything to anybody,
 * and the line beside the button says so.
 *
 * Nothing is computed here: the maximum comes back from @gil-bricks/core through
 * the board, and the message is assembled from config.
 */
import { useState } from 'preact/hooks';
import { RETRADE } from '../../config/pipeline';

export interface RetradeProps {
  /** The new maximum, already formatted, or null when no price fixes it. */
  maxOffer: string | null;
  /** The message to paste, or '' when there is nothing honest to say. */
  message: string;
  busy: boolean;
}

export function RetradeRadar({ maxOffer, message, busy }: RetradeProps) {
  const [said, setSaid] = useState('');
  const copy = (): void => {
    // The clipboard is the only thing this touches. No request is made.
    void navigator.clipboard?.writeText(message)
      .then(() => setSaid(RETRADE.copied))
      .catch(() => setSaid(RETRADE.copyFailed));
  };
  return (
    <div class="dc-retrade">
      <p class="dc-retrade-h">{RETRADE.heading}</p>
      <p class="dc-retrade-max">{maxOffer === null ? RETRADE.none : RETRADE.max(maxOffer)}</p>
      {message !== '' && (
        <>
          <p class="dc-retrade-msg">{message}</p>
          <div class="dc-retrade-actions">
            <button type="button" class="btn-secondary dc-retrade-copy" disabled={busy} onClick={copy}>
              {RETRADE.copy}
            </button>
            <span class="dc-retrade-note">{RETRADE.sendNothing}</span>
          </div>
          {said !== '' && <p class="dc-retrade-said" role="status">{said}</p>}
        </>
      )}
    </div>
  );
}

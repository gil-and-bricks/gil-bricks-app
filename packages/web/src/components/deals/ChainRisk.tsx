/**
 * ACCEPTED IS NOT SAFE (P11).
 *
 * Our stage names read like a ladder, and the rung called "Offer accepted" looks
 * like the home straight. It is the opposite: it is where deals die. This says
 * so once, plainly, on the deal that has just got there.
 *
 * It states market figures as market figures — approximate, industry-wide, and
 * never a prediction about this particular deal. Every word is config.
 */
import { CHAIN_RISK } from '../../config/pipeline';

export interface ChainRiskProps {
  dealTitle: string;
  busy: boolean;
  onDismiss: () => void;
}

export function ChainRiskCard({ dealTitle, busy, onDismiss }: ChainRiskProps) {
  return (
    <div class="dc-chain" role="note">
      <p class="dc-chain-h">{CHAIN_RISK.heading}</p>
      <p class="dc-chain-lead">{CHAIN_RISK.lead}</p>
      <p class="dc-chain-window">{CHAIN_RISK.window}</p>
      <p class="dc-chain-causes-h">{CHAIN_RISK.causesLead}</p>
      <ul class="dc-chain-causes">
        {CHAIN_RISK.causes.map((cause) => <li>{cause}</li>)}
      </ul>
      <p class="dc-chain-source">{CHAIN_RISK.source}</p>
      <button type="button" class="btn-link dc-chain-ok" disabled={busy} onClick={onDismiss}>
        {CHAIN_RISK.dismiss}
        <span class="sr-only">{CHAIN_RISK.dismissFor(dealTitle)}</span>
      </button>
    </div>
  );
}

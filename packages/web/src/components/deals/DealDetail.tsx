/**
 * X2 — EVERYTHING THAT USED TO MAKE THE CARDS DIFFERENT HEIGHTS.
 *
 * The board is a glance. A card that grows a block because this deal happens to
 * carry a survey, and another that does not, turns a board into a jumble — and
 * the thing a board is for is comparing things at a glance, which you cannot do
 * when they are not the same shape.
 *
 * So every one of these blocks moved off the card and into one place, rendered
 * on the deal's own page. Nothing was deleted: the evidence chips, the auction
 * warning, the recorded facts, the dates and the score history are all still
 * here, with room to breathe that a card never had.
 *
 * ONE COMPONENT, NOT TWO. The board could render this too if it ever wanted to,
 * and the deal page renders it now — so there is no second copy to drift.
 */
import { BOARD_COPY } from '../../config/pipeline';
import { COPY } from '../../config/copy';
import { features } from '../../config/features';
import { DEAL_PAGE_COPY } from '../../config/dealPage';
import { evidenceInputsFor } from '../../lib/deals/evidenceFor';
import { factNotes, type DealFact } from '../../lib/deals/facts';
import { strategies } from '@gil-bricks/core';
import { datesOf, hasScoreHistory, isLive, type BoardDeal } from '../../lib/deals/board';
import { EvidenceChips } from './EvidenceChips';
import { DealFacts } from './DealFacts';
import { DealDates } from './DealDates';
import { ScoreHistory } from './ScoreHistory';
import { DealFindings } from './DealFindings';

export interface DealDetailProps {
  deal: BoardDeal;
  /** The facts recorded against this deal. */
  facts: DealFact[];
  /** The `finds` codes the extension carried over with this deal (X2). */
  findingCodes: string | null;
  busy: boolean;
  onAddFact?: (type: string, value: number | null, note: string) => Promise<boolean>;
  onRemoveFact?: (id: string) => Promise<boolean>;
  onSetDate?: (key: string, value: string) => void;
}

/**
 * The sold-price rule changed under a saved score, and this deal has no record
 * of the evidence it was scored against — so it cannot be re-judged by the same
 * bar. Only where the strategy actually scores sold prices: an HMO has no such
 * component, so it has nothing to have lost.
 */
function evidenceUnknown(deal: BoardDeal): boolean {
  return (deal.sold_evidence === null || deal.sold_evidence === undefined)
    && (strategies.find((s) => s.id === deal.strategy)?.score ?? []).some((c) => c.key === 'evidence');
}

export function DealDetail({
  deal, facts, findingCodes, busy, onAddFact, onRemoveFact, onSetDate,
}: DealDetailProps) {
  const scored = deal.current_score !== null && deal.current_score !== undefined;
  return (
    <div class="dd">
      {/* X2 — the reason this page exists: what the listing said and did not say. */}
      <h2 class="dp-h2">{DEAL_PAGE_COPY.fromTheListing}</h2>
      <DealFindings codes={findingCodes} />

      {deal.is_auction && (
        <p class="dc-auction" role="note">⚠ {COPY.account.auctionWarning}</p>
      )}

      {features.evidenceChips && scored && (
        <EvidenceChips
          strategy={deal.strategy}
          inputs={evidenceInputsFor(deal, facts)}
          score={(deal.current_score as number).toFixed(1)}
        />
      )}

      {features.dealFacts && evidenceUnknown(deal) && scored && (
        <p class="dc-fact-note" role="note">{BOARD_COPY.card.factNoEvidence}</p>
      )}
      {features.dealFacts && factNotes(deal.strategy, facts).map((n) => (
        <p class="dc-fact-note" role="note" key={n.label}>{n.label}: {n.note}</p>
      ))}

      {features.dealFacts && (
        <DealFacts
          dealId={deal.id}
          dealTitle={deal.title}
          strategy={deal.strategy}
          facts={facts}
          busy={busy}
          canAdd={isLive(deal) && onAddFact !== undefined}
          openWith=""
          onOpened={() => undefined}
          onAdd={(t, val, n) => onAddFact?.(t, val, n) ?? Promise.resolve(false)}
          onRemove={(id) => onRemoveFact?.(id) ?? Promise.resolve(false)}
        />
      )}

      {features.dealDates && isLive(deal) && (
        <DealDates
          dealId={deal.id}
          dealTitle={deal.title}
          stage={deal.stage}
          isAuction={deal.is_auction}
          dates={datesOf(deal)}
          busy={busy}
          onSet={(key, value) => onSetDate?.(key, value)}
        />
      )}

      {features.verdictChanges && scored && hasScoreHistory(deal) && (
        <ScoreHistory dealId={deal.id} dealTitle={deal.title} />
      )}
    </div>
  );
}

/**
 * WHAT NEEDS YOU TODAY (P8).
 *
 * One deal, one verb, and it has to be RIGHT — a line that cries wolf is worse
 * than no line. The ranking is strict and lives in config (URGENCY): a date you
 * set beats an answer that moved, which beats a deal sitting too long for its
 * stage, which beats a decision resting on a guess. If nothing qualifies the
 * board says so; urgency is never invented to fill the space.
 *
 * Every figure here already exists — the stage's own dwell times, P6's
 * acknowledgements, P7's evidence chips. Nothing new is computed about a deal.
 */
import { CHIP_SPECS, evidenceChips, type ChipKey, type StrategyId, fmtMoney } from '@gil-bricks/core';
import { features } from '../../config/features';
import { BOARD_COPY, TODAY_COPY, URGENCY, DEAL_DATES, dateAppliesAt } from '../../config/pipeline';
import { daysInStage, dwellState, stageMeta, type BoardDeal } from './board';
import { evidenceInputsFor } from './evidenceFor';
import type { DealFact } from './facts';
import type { DealChange } from './changes';

export type UrgencyReason = (typeof URGENCY.order)[number];

export interface Urgent {
  deal: BoardDeal;
  reason: UrgencyReason;
  /** The finished line, in the operator's voice. */
  text: string;
  /** What money is at stake — the tie-break, and nothing else. */
  price: number;
}

/** The fix for a weak input — the SAME words the evidence chips use (P7). */
const ACTIONS: Record<string, string> = Object.fromEntries(
  (Object.keys(CHIP_SPECS) as ChipKey[]).map((k) => [k, CHIP_SPECS[k].action]),
);

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** The price the deal is about, for tie-breaks only. Never shown, never scored. */
export function priceOf(deal: Pick<BoardDeal, 'url_params'>): number {
  const raw = new URLSearchParams(deal.url_params).get('price');
  const n = Number(raw ?? '');
  return Number.isFinite(n) ? n : 0;
}

/**
 * The end of a plain day, in the reader's OWN time. Parsing it as UTC put the
 * boundary an hour out through British Summer Time, which mislabelled "today"
 * and "tomorrow" for the hour that matters most (P8 review).
 */
export function endOfDay(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return Number.NaN;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/**
 * The dates set on a deal that still APPLY to it, soonest first. A date stranded
 * by a stage move — an exchange date on a deal the chain fell through on — stays
 * on the card, and stays clearable, but stops driving the line (P8 review).
 */
export function datesOn(deal: BoardDeal): { key: string; noun: string; at: number }[] {
  const out: { key: string; noun: string; at: number }[] = [];
  for (const spec of DEAL_DATES) {
    if (!dateAppliesAt(spec, deal.stage, deal.is_auction)) continue;
    const raw = (deal as unknown as Record<string, string | null | undefined>)[spec.key];
    if (typeof raw !== 'string' || raw === '') continue;
    // A date with no time is the END of that day: a chase set for today is not
    // overdue at nine in the morning.
    const at = endOfDay(raw);
    if (Number.isFinite(at)) out.push({ key: spec.key, noun: spec.noun, at });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** "today" / "tomorrow" / "past" — never a bare date in the urgent line. */
function whenWord(at: number, now: number): string {
  if (at < now) return TODAY_COPY.when.overdue;
  return at - now <= DAY ? TODAY_COPY.when.today : TODAY_COPY.when.tomorrow;
}

export interface UrgencyInput {
  deals: readonly BoardDeal[];
  facts: readonly DealFact[];
  changes: readonly DealChange[];
  now: number;
}

/** Everything that qualifies, in strict tier order then by money at stake. */
export function rankUrgent({ deals, facts, changes, now }: UrgencyInput): Urgent[] {
  const live = deals.filter((d) => d.status === 'live');
  const found: Urgent[] = [];

  for (const d of live) {
    const price = priceOf(d);
    const act = stageMeta(d.stage).act;

    // (a) a date the person set, this close or already past. Of the dates in
    // range the CLOSEST to now wins, so a chase you set last year can never hide
    // tomorrow's auction (P8 review).
    const inRange = datesOn(d).filter((x) => x.at - now <= URGENCY.deadlineWithinHours * HOUR);
    const due = features.dealDates
      ? inRange.sort((a, b) => Math.abs(a.at - now) - Math.abs(b.at - now))[0]
      : undefined;
    if (due) {
      found.push({ deal: d, reason: 'deadline', price, text: TODAY_COPY.deadline(act, d.title, due.noun, whenWord(due.at, now)) });
      continue;
    }

    // (b) the answer moved and nobody has read it
    const unread = changes.filter((c) => c.deal_id === d.id && c.acknowledged_at === null)
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    if (unread) {
      // The score may not have moved at all — a fact can change only the money
      // you must find. Say which one actually changed (D4 review).
      const cashOnly = unread.from_score === unread.to_score
        && typeof unread.to_cash === 'number' && typeof unread.from_cash === 'number';
      found.push({
        deal: d,
        reason: 'unread-change',
        price,
        text: cashOnly
          ? TODAY_COPY.unreadCash(d.title, fmtMoney(unread.to_cash as number))
          : TODAY_COPY.unreadChange(d.title, unread.to_score.toFixed(1)),
      });
      continue;
    }

    // (c) sat longer than is normal FOR ITS STAGE
    if (dwellState(d, now) !== 'fresh' && dwellState(d, now) !== 'none' && act !== '') {
      found.push({ deal: d, reason: 'stale', price, text: TODAY_COPY.stale(act, d.title, TODAY_COPY.days(daysInStage(d, now))) });
      continue;
    }

    // (d) a decision resting on a guess, at a stage that should know better. The
    // chips are where "evidenced" is decided, so with them off this tier is off.
    const expected = features.evidenceChips ? URGENCY.expectedEvidence[d.stage] ?? [] : [];
    if (expected.length > 0) {
      const chips = evidenceChips(d.strategy as StrategyId, evidenceInputsFor(d, facts.filter((f) => f.deal_id === d.id)));
      const weak = chips.find((c) => expected.includes(c.key) && c.state !== 'evidenced');
      if (weak) {
        const action = ACTIONS[weak.key] ?? '';
        if (action !== '') {
          found.push({ deal: d, reason: 'missing-evidence', price, text: TODAY_COPY.missing(action, d.title, stageMeta(d.stage).label.toLowerCase()) });
        }
      }
    }
  }

  const tier = (r: UrgencyReason): number => URGENCY.order.indexOf(r);
  return found.sort((a, b) => tier(a.reason) - tier(b.reason) || b.price - a.price);
}

/** The one thing, or null when nothing qualifies. */
export function mostUrgent(input: UrgencyInput): Urgent | null {
  return rankUrgent(input)[0] ?? null;
}

export interface TodayLine {
  /** The line to show, in the operator's voice. */
  text: string;
  /** The deal it names, or null for the "nothing needs you" line. */
  dealId: string | null;
  /** Why it is urgent, for the card highlight. Null when nothing is. */
  reason: UrgencyReason | null;
}

/**
 * "What do I need to do today?" — ONE deal, ONE verb, ranked by URGENCY.order.
 * When nothing qualifies it says so plainly and NEVER implies the board is empty
 * when a bought or parked deal is sitting right there.
 */
export function todayLine(input: UrgencyInput): TodayLine {
  const top = mostUrgent(input);
  if (top) return { text: top.text, dealId: top.deal.id, reason: top.reason };
  const live = input.deals.filter((d) => d.status === 'live').length;
  return {
    text: live === 0 ? BOARD_COPY.nothingToday : BOARD_COPY.tickingAlong(live),
    dealId: null,
    reason: null,
  };
}

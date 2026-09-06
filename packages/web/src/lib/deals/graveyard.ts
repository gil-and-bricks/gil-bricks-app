/**
 * THE DEAD DEAL GRAVEYARD (P9).
 *
 * Beginners think a dead deal is a failure. Operators know it is filtering that
 * worked: most deals should die, and the ones you kill are the money you did not
 * lose. This module holds the shape of a death, the frozen card that goes with
 * it, and the ONE answer the graveyard is allowed to produce — a pattern, and
 * only when the sample is real.
 *
 * NO MATHS LIVES HERE. The snapshot copies figures that @gil-bricks/core has
 * already returned; the chips come back from the core's own evidence rules. The
 * only arithmetic is counting deaths, which is a sample size, never an input to
 * a score.
 */
import { CHIP_SPECS, evidenceChips, type ChipKey, type ChipState, type EvidenceChip, type StrategyId } from '@gil-bricks/core';
import { GRAVEYARD, GRAVEYARD_COPY, PARK_REASONS, parkReason } from '../../config/pipeline';
import type { BoardDeal } from './board';
import { evidenceInputsFor } from './evidenceFor';
import { applyFacts, type DealFact } from './facts';

/**
 * The card as it died, written once and never updated. It holds the NUMBERS and
 * the states, not the words: labels come from config, so rewording a stage or a
 * chip re-words every headstone, while nothing a rules change touches can move
 * what this deal scored on the day you killed it.
 */
export interface DeathSnapshot {
  /** Schema version — an older shape must never be read as a newer one. */
  v: 1;
  title: string;
  strategy: string;
  /** The stage it reached (a stable key; its label is config). */
  stage: string;
  /** What it scored, or null if it was never scoreable. */
  score: number | null;
  /** @gil-bricks/core's OWN sentence at that moment — unrebuildable later. */
  verdictLine: string;
  /** The board figure it carried. */
  figure: string;
  /** The evidence chips exactly as they stood (P7 keys + states). */
  chips: { key: string; state: ChipState }[];
  /** The facts it had learned, oldest first. */
  facts: { type: string; value: number | null; note: string; at: string }[];
}

/** One recorded death, as the board receives it. */
export interface DealDeath {
  id: string;
  deal_id: string;
  /** A stable PARK_REASONS key. Empty only for a death recorded before P9. */
  reason_key: string;
  note: string;
  /** The frozen card, or null when it could not be read (or predates P9). */
  snapshot: DeathSnapshot | null;
  at: string;
  revived_at: string | null;
}

/** What `buildDeathSnapshot` needs to know about the deal that is dying. */
export interface DyingDeal {
  title: string;
  strategy: string;
  stage: string;
  current_score: number | null;
  verdict_line: string | null;
  headline_figure: string | null;
  url_params: string;
  sold_evidence?: string | null;
  room_size_failures?: number | null;
}

/**
 * Freeze the card. Built on the SERVER when a deal is killed, so every death is
 * captured the same way whatever asked for it — the park chip, the change line's
 * one-tap kill, or anything later. Facts are applied first, because the fact is
 * the truth from the moment it lands (P5).
 */
export function buildDeathSnapshot(deal: DyingDeal, facts: readonly DealFact[]): DeathSnapshot {
  const params = applyFacts(deal.strategy, deal.url_params, facts);
  const chips = evidenceChips(
    deal.strategy as StrategyId,
    evidenceInputsFor({ ...deal, url_params: params }, facts),
  );
  return {
    v: 1,
    title: deal.title,
    strategy: deal.strategy,
    stage: deal.stage,
    score: typeof deal.current_score === 'number' && Number.isFinite(deal.current_score) ? deal.current_score : null,
    verdictLine: deal.verdict_line ?? '',
    figure: deal.headline_figure ?? '',
    chips: chips.map((c) => ({ key: c.key, state: c.state })),
    facts: [...facts]
      .sort((a, b) => a.entered_at.localeCompare(b.entered_at) || a.id.localeCompare(b.id))
      .map((f) => ({ type: f.fact_type, value: f.value, note: (f.note ?? '').trim(), at: f.entered_at })),
  };
}

/**
 * Read a stored snapshot. Anything unreadable, or written by a shape we do not
 * know, comes back null — the headstone then says the card was not kept rather
 * than showing half of one.
 */
export function parseSnapshot(raw: string | null | undefined): DeathSnapshot | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const v = JSON.parse(raw) as Partial<DeathSnapshot> | null;
    if (v === null || v.v !== 1 || typeof v.strategy !== 'string') return null;
    return {
      v: 1,
      title: String(v.title ?? ''),
      strategy: v.strategy,
      stage: String(v.stage ?? ''),
      score: typeof v.score === 'number' && Number.isFinite(v.score) ? v.score : null,
      verdictLine: String(v.verdictLine ?? ''),
      figure: String(v.figure ?? ''),
      chips: Array.isArray(v.chips) ? v.chips.filter((c) => typeof c?.key === 'string') : [],
      facts: Array.isArray(v.facts) ? v.facts.filter((f) => typeof f?.type === 'string') : [],
    };
  } catch {
    return null;
  }
}

/**
 * The frozen chips, ready to render. The STATES are the ones that were captured
 * and never move again; the LABELS are read from config now, so rewording a chip
 * re-words every headstone with it. A key we no longer know is dropped rather
 * than shown as itself.
 */
export function frozenChips(snapshot: DeathSnapshot | null): EvidenceChip[] {
  if (!snapshot) return [];
  return snapshot.chips
    .filter((c) => CHIP_SPECS[c.key as ChipKey] !== undefined)
    .map((c) => ({ key: c.key as ChipKey, label: CHIP_SPECS[c.key as ChipKey].label, state: c.state }));
}

/** A stored death row, as the board's API sends it. */
export interface DeathRowJson {
  id: string;
  deal_id: string;
  reason_key: string;
  note: string;
  snapshot_json: string;
  at: string;
  revived_at: string | null;
}

/** One row → one death, with its snapshot read once, where it is read. */
export function toDeath(row: DeathRowJson): DealDeath {
  return {
    id: row.id,
    deal_id: row.deal_id,
    reason_key: row.reason_key,
    note: row.note ?? '',
    snapshot: parseSnapshot(row.snapshot_json),
    at: row.at,
    revived_at: row.revived_at ?? null,
  };
}

/** One dead deal as the graveyard shows it: the frozen card, why, and when. */
export interface Headstone {
  deal: BoardDeal;
  death: DealDeath | null;
  /** The reason in today's words, or the text stored before P9 kept keys. */
  reason: string;
  note: string;
  /** When it died — the death's own time, or when it entered the dead stage. */
  at: string;
  snapshot: DeathSnapshot | null;
}

/**
 * The graveyard: dead deals, most recent first. A deal that was brought back is
 * not a dead deal, so it leaves — its death row stays in the database as the
 * history, and comes back if it is killed again.
 */
export function headstones(deals: readonly BoardDeal[], deaths: readonly DealDeath[]): Headstone[] {
  const open = new Map<string, DealDeath>();
  for (const d of deaths) {
    if (d.revived_at !== null && d.revived_at !== undefined) continue;
    const held = open.get(d.deal_id);
    if (!held || d.at.localeCompare(held.at) > 0) open.set(d.deal_id, d);
  }
  return deals
    .filter((d) => d.status === 'dead')
    .map((deal) => {
      const death = open.get(deal.id) ?? null;
      return {
        deal,
        death,
        // Today's words for a recorded key; otherwise whatever the kill stored on
        // the deal itself, because a deal killed before P9 still knows why (review).
        reason: parkReason(death?.reason_key ?? '')?.label ?? (deal.dead_reason ?? '').trim(),
        note: (death?.note ?? '').trim(),
        at: death?.at ?? deal.stage_since,
        snapshot: death?.snapshot ?? null,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at) || a.deal.id.localeCompare(b.deal.id));
}

/** A pattern worth saying, with the sample it was drawn from. */
export interface DeathPattern {
  reasonKey: string;
  count: number;
  /** How many deaths the count is out of — stated in the line, always. */
  total: number;
  /** The finished line: the sample, then what it might mean where there is one. */
  line: string;
}

/**
 * The one answer the graveyard produces. It speaks ONLY when at least
 * `GRAVEYARD.patternMin` of the last `GRAVEYARD.patternWindow` deaths share a
 * reason, and it always states the sample. Below that it says there is not
 * enough to see yet — two data points are never a trend.
 *
 * Deaths recorded before P9 carry no reason key, so they cannot be counted; they
 * are left out of the sample as well as the count, and the stated total is the
 * one that was actually counted.
 */
export function patternIn(stones: readonly Headstone[]): DeathPattern | null {
  // The sample is the dead deals themselves — the last `patternWindow` of them,
  // which is what "your last 14 dead deals" means to the person reading it. A
  // death recorded before P9 carries no reason key, so it cannot be part of any
  // SHARE, but it is still one of the dead deals in the window (review).
  const window = stones.slice(0, GRAVEYARD.patternWindow);
  if (window.length === 0) return null;
  const keys = window.map((s) => s.death?.reason_key ?? '').filter((k) => parkReason(k) !== undefined);
  const order = PARK_REASONS.map((r) => r.key);
  let top = '';
  let best = 0;
  for (const key of new Set(keys)) {
    const n = keys.filter((k) => k === key).length;
    // A tie keeps the config's own order, so the answer is the same every time.
    if (n > best || (n === best && order.indexOf(key) < order.indexOf(top))) {
      top = key;
      best = n;
    }
  }
  if (best < GRAVEYARD.patternMin) return null;
  const reason = parkReason(top);
  if (!reason) return null;
  const sample = GRAVEYARD_COPY.pattern(best, window.length, reason.diedOn);
  return {
    reasonKey: top,
    count: best,
    total: window.length,
    line: reason.pattern === undefined ? sample : `${sample} ${reason.pattern}`,
  };
}

/** Said instead, when there is not enough to see: the sample, and nothing more. */
export function noPatternYet(stones: readonly Headstone[]): string {
  // The SAME sample the pattern line would have stated, so the two can never
  // describe different sets of deals (review).
  return GRAVEYARD_COPY.noPattern(Math.min(stones.length, GRAVEYARD.patternWindow));
}

/**
 * Pure, DOM-free helpers for the pipeline board (P3). The board answers ONE
 * question — "which of my deals needs me?" — so this module only shapes the
 * data the card needs to decide, nothing more. Verdict colour comes from the
 * SINGLE core source (`verdictForScore`) so the board, the analyser chip and the
 * extension speak one visual language. Tested in board.test.ts.
 */
import { verdictForScore } from '@gil-bricks/core';
import { features } from '../../config/features';
import { BOARD_COPY, PROGRESS_STAGES, DEAD_STAGE, INITIAL_STAGE, type Stage } from '../../config/pipeline';

/** One deal as the board needs it (from /api/deals when the flag is on). */
export interface BoardDeal {
  id: string;
  strategy: string;
  title: string;
  url_params: string;
  stage: string;
  current_score: number | null;
  status: string;
  headline_figure: string | null;
  key_figure: string;
  /** When the deal ENTERED its current stage (latest stage-history at); a fallback
   * to the immutable created_at is applied server-side for migrated deals that
   * predate history, so a re-score (which bumps updated_at) never resets the age. */
  stage_since: string;
  is_auction: boolean;
  /** The analyser's own verdict line (@gil-bricks/core DealScore.headline) at save
   * time — the short reason in the user's voice, referencing their own criteria.
   * Null for migrated/older deals (the card then says why it can't score). */
  verdict_line: string | null;
  updated_at: string;
  /** A date the user set for this deal (viewing booked, offer deadline). Ranks the
   * today line ABOVE dwell time. No date-entry UI exists yet (a later sprint), so
   * this is the structural seam and is absent for now. */
  due_date?: string | null;
}

const STAGE_BY_KEY: Record<string, Stage> = Object.fromEntries([...PROGRESS_STAGES, DEAD_STAGE].map((s) => [s.key, s]));
/** The stage config for a key (never throws; unknown keys get the initial stage). */
export function stageMeta(key: string): Stage {
  return STAGE_BY_KEY[key] ?? STAGE_BY_KEY[INITIAL_STAGE];
}

const DAY = 86_400_000;
/** Whole days between an ISO timestamp and now (floored, never negative). */
export function daysInStage(deal: Pick<BoardDeal, 'stage_since'>, now: number): number {
  const t = Date.parse(deal.stage_since);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / DAY));
}

export type DwellState = 'fresh' | 'amber' | 'cold' | 'none';
/**
 * Stage-AWARE ageing — never a blanket timer. A deal past its stage's normal dwell
 * is 'amber'; past 'cold'. Terminal stages (done/dead, dwellNormalDays 0) never age.
 */
export function dwellState(deal: Pick<BoardDeal, 'stage' | 'stage_since' | 'status'>, now: number): DwellState {
  if (deal.status !== 'live') return 'none';
  const meta = stageMeta(deal.stage);
  if (meta.dwellNormalDays <= 0) return 'none';
  const d = daysInStage(deal, now);
  if (d > meta.dwellColdDays) return 'cold';
  if (d > meta.dwellNormalDays) return 'amber';
  return 'fresh';
}

/** The card's next-step line — an INSTRUCTION, not a description: the stage's verb
 * (config `todo`) + how long it's sat. "Book the viewing, or bin it — 3 days sat
 * here". Empty for terminal deals (nothing to do). */
export function nextStepLine(deal: Pick<BoardDeal, 'stage' | 'stage_since' | 'status'>, now: number): string {
  if (deal.status !== 'live') return '';
  const meta = stageMeta(deal.stage);
  if (meta.todo === '') return '';
  const d = daysInStage(deal, now);
  const age = dwellState(deal, now);
  const c = BOARD_COPY.dwell;
  const dwell = age === 'cold' ? `${d} ${c.days}, ${c.goneCold}`
    : age === 'amber' ? `${d} ${c.days}, ${c.noUpdate}`
    : d === 0 ? c.today : `${d} ${d === 1 ? c.day : c.days} ${c.satHere}`;
  return `${meta.todo} — ${dwell}`;
}

/** The inputs a strategy MUST have in its saved url params before it can be scored
 * (mirrors each analyser verdict's readiness gate). Returns the human name of the
 * first missing one, or null if scoreable. arv/gdv are excluded — the analyser
 * pre-fills them from the valuation, so their absence doesn't block a score. */
export function missingRequiredInput(strategy: string, urlParams: string): string | null {
  const q = new URLSearchParams(urlParams);
  const num = (k: string): number => Number(q.get(k) ?? '');
  const c = BOARD_COPY.missing;
  if (!(num('price') > 0)) return c.price;
  if (strategy === 'btl' || strategy === 'brrrr') { if (!(num('rent') > 0)) return c.rent; }
  if (strategy === 'hmo') {
    // Mirror the analyser's HMO readiness gate: a 7+ person (sui generis) HMO is
    // outside what the tool scores, so never promise a one-tap score for one.
    if (q.get('rooms') === '7plus') return c.tooManyRooms;
    if (!(num('roomRent') > 0)) return c.roomRent;
  }
  return null;
}

/** The card's verdict presentation. A scored deal shows its score (with colour) and
 * the analyser's own reason line; an unscored LIVE deal never shows a bare dash — it
 * either offers a one-tap score or names the input it's missing; a terminal deal
 * shows its figure quietly. */
export interface CardVerdict {
  scored: boolean;
  /** ds-good/marginal/walk when scored, ds-none otherwise. */
  cls: 'ds-good' | 'ds-marginal' | 'ds-walk' | 'ds-none';
  line: string;
  /** 'none' = nothing to do (scored or terminal); 'score' = tap to score (opens the
   * analyser, which backfills the score on open); 'add' = a required input is missing. */
  action: 'none' | 'score' | 'add';
}
export function cardVerdict(d: BoardDeal): CardVerdict {
  // Deal Score switched off: never ask for a score the analyser cannot produce —
  // the card shows its figure quietly, exactly like a terminal deal.
  if (!features.dealScore) return { scored: false, cls: 'ds-none', line: cardFigure(d), action: 'none' };
  if (d.current_score === null || !Number.isFinite(d.current_score)) {
    if (d.status !== 'live') return { scored: false, cls: 'ds-none', line: cardFigure(d), action: 'none' };
    const missing = missingRequiredInput(d.strategy, d.url_params);
    return missing
      ? { scored: false, cls: 'ds-none', line: BOARD_COPY.addToScore(missing), action: 'add' }
      : { scored: false, cls: 'ds-none', line: BOARD_COPY.tapToScore, action: 'score' };
  }
  const line = (d.verdict_line ?? '').trim() || cardFigure(d);
  return { scored: true, cls: scoreClass(d.current_score), line, action: 'none' };
}

/** A stage plus the deals sitting in it (freshest first). */
export interface StageColumn {
  stage: Stage;
  deals: BoardDeal[];
}

/**
 * The live board: the seven progress stages (worth-a-look → bought-it) IN ORDER,
 * each with its deals — but ONLY stages that actually hold a deal. Empty stages
 * are omitted so a phone never shows columns of nothing and the board stays a
 * "which needs me" view, not a wall. Dead/parked deals are excluded (see below).
 */
export function stageColumns(deals: readonly BoardDeal[]): StageColumn[] {
  return PROGRESS_STAGES.map((stage) => ({
    stage,
    deals: deals.filter((d) => d.stage === stage.key),
  })).filter((c) => c.deals.length > 0);
}

/** Dead/parked deals — kept off the live board, reachable but tucked away. */
export function parkedDeals(deals: readonly BoardDeal[]): BoardDeal[] {
  return deals.filter((d) => d.stage === DEAD_STAGE.key || d.status === 'dead');
}

/** The ONE figure the card shows: the analyser's stored board figure, or the
 * honest key-figure fallback for migrated/older deals that predate it. */
export function cardFigure(d: BoardDeal): string {
  const fig = (d.headline_figure ?? '').trim();
  return fig !== '' ? fig : d.key_figure.trim();
}

/** Traffic-light class for a score, matching the analyser's DealScore chip
 * (ds-good / ds-marginal / ds-walk). A null/unscored deal gets no colour. */
export function scoreClass(score: number | null): 'ds-good' | 'ds-marginal' | 'ds-walk' | 'ds-none' {
  if (score === null || !Number.isFinite(score)) return 'ds-none';
  const v = verdictForScore(score);
  return v === 'good' ? 'ds-good' : v === 'marginal' ? 'ds-marginal' : 'ds-walk';
}

/** The single most important thing to do today, or an honest "nothing". */
export interface TodayLine {
  /** The line to show, in the operator's voice. */
  text: string;
  /** The deal it names (for a link/highlight), or null for the "nothing" line. */
  dealId: string | null;
}

/**
 * "What do I need to do today?" — ONE deal, ONE action. Ranked by a strict
 * precedence (P4): (1) a date the user set that's due/overdue; (2) how long a deal
 * has sat past what's NORMAL for its stage (stage-aware, so chasing an offer beats
 * waiting on searches); (3) a brand-new deal nobody has actioned yet. If nothing
 * qualifies it says so plainly — never manufactured urgency.
 */
export function todayLine(deals: readonly BoardDeal[], now: number): TodayLine {
  const live = deals.filter((d) => d.status === 'live');
  const dwellPhrase = (d: BoardDeal): string => {
    const days = daysInStage(d, now);
    const age = dwellState(d, now);
    const c = BOARD_COPY.dwell;
    const dp = days === 0 ? c.today : `${days} ${days === 1 ? c.day : c.days}`;
    return `${dp}${age === 'cold' ? `, ${c.goneCold}` : age === 'amber' ? `, ${c.noUpdate}` : ''}`;
  };
  const line = (d: BoardDeal): string => `${stageMeta(d.stage).todo} — ${d.title} · ${dwellPhrase(d)}`;

  // (1) A date the user set, due or overdue. Structural seam — no date-entry yet.
  const dated = live
    .filter((d) => d.due_date && Date.parse(d.due_date) <= now)
    .sort((a, b) => Date.parse(a.due_date as string) - Date.parse(b.due_date as string));
  if (dated.length > 0) return { text: line(dated[0]), dealId: dated[0].id };

  // (2) Past its stage's NORMAL dwell — most overdue first (by ratio, so a stage with
  // a short normal dwell that's blown wins over a long-dwell stage barely over).
  const overdue = live
    .map((d) => ({ d, ratio: daysInStage(d, now) / stageMeta(d.stage).dwellNormalDays }))
    .filter((x) => Number.isFinite(x.ratio) && x.ratio > 1)
    .sort((a, b) => b.ratio - a.ratio);
  if (overdue.length > 0) return { text: line(overdue[0].d), dealId: overdue[0].d.id };

  // (3) A brand-new deal nobody has actioned — still in the initial stage, sat ≥1 day
  // (never nag on day zero). Oldest first.
  const untouched = live
    .filter((d) => d.stage === INITIAL_STAGE && daysInStage(d, now) >= 1)
    .sort((a, b) => daysInStage(b, now) - daysInStage(a, now));
  if (untouched.length > 0) return { text: line(untouched[0]), dealId: untouched[0].id };

  // Nothing needs you — say so plainly, and NEVER imply the board is empty when a
  // bought/parked deal is sitting right there (the "analyse a listing" call to action
  // belongs only to the genuinely-empty board, which the board renders separately).
  const n = live.length;
  if (n === 0) return { text: BOARD_COPY.nothingToday, dealId: null };
  return { text: BOARD_COPY.tickingAlong(n), dealId: null };
}

/** Board tallies for the quiet counter. `live` is the only figure the 100-cap
 * counts; `done`/`dead` are terminal wins/memory and are shown so a bought-only
 * board never reads as empty. `isEmpty` is true ONLY when there is nothing at all. */
export interface BoardCounts { live: number; done: number; dead: number; isEmpty: boolean }
export function boardCounts(deals: readonly BoardDeal[]): BoardCounts {
  const live = deals.filter((d) => d.status === 'live').length;
  const done = deals.filter((d) => d.status === 'done').length;
  const dead = deals.filter((d) => d.status === 'dead').length;
  return { live, done, dead, isEmpty: deals.length === 0 };
}

/** The quiet counter line: live vs cap, plus terminal tallies so a bought/parked
 * deal is acknowledged as a result, not an absence. */
export function counterLine(counts: BoardCounts, cap: number): string {
  const c = BOARD_COPY.counter;
  const parts = [c.live(counts.live, cap)];
  if (counts.done > 0) parts.push(c.bought(counts.done));
  if (counts.dead > 0) parts.push(c.parked(counts.dead));
  return parts.join(c.separator);
}

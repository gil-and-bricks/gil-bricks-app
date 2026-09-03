/**
 * Pure, DOM-free helpers for the pipeline board (P3). The board answers ONE
 * question — "which of my deals needs me?" — so this module only shapes the
 * data the card needs to decide, nothing more. Verdict colour comes from the
 * SINGLE core source (`verdictForScore`) so the board, the analyser chip and the
 * extension speak one visual language. Tested in board.test.ts.
 */
import { verdictForScore } from '@gil-bricks/core';
import { PROGRESS_STAGES, DEAD_STAGE, INITIAL_STAGE, type Stage } from '../../config/pipeline';

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
  const dwell = age === 'cold' ? `${d} days, gone cold`
    : age === 'amber' ? `${d} days, no update`
    : d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} sat here`;
  return `${meta.todo} — ${dwell}`;
}

/** The card's verdict presentation. A deal with a stored score shows that score
 * (with its colour) and the analyser's own reason line; a deal without one (migrated
 * or pre-verdict-line) never shows a bare dash — it says plainly why it can't. */
export interface CardVerdict {
  scored: boolean;
  /** ds-good/marginal/walk when scored, ds-none otherwise. */
  cls: 'ds-good' | 'ds-marginal' | 'ds-walk' | 'ds-none';
  /** The reason line (scored) or the honest can't-score prompt (unscored). */
  line: string;
}
export function cardVerdict(d: BoardDeal): CardVerdict {
  if (d.current_score === null || !Number.isFinite(d.current_score)) {
    return { scored: false, cls: 'ds-none', line: 'Re-open to score this' };
  }
  const line = (d.verdict_line ?? '').trim() || cardFigure(d);
  return { scored: true, cls: scoreClass(d.current_score), line };
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
    const dp = days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`;
    return `${dp}${age === 'cold' ? ', gone cold' : age === 'amber' ? ', no update' : ''}`;
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
  if (n === 0) return { text: 'Nothing needs you today.', dealId: null };
  return { text: `Nothing needs you today. ${n} deal${n === 1 ? '' : 's'} ticking along.`, dealId: null };
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
  const parts = [`${counts.live} of ${cap} live`];
  if (counts.done > 0) parts.push(`${counts.done} bought`);
  if (counts.dead > 0) parts.push(`${counts.dead} parked`);
  return parts.join(' · ');
}

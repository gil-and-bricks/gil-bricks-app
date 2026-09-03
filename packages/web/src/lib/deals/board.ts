/**
 * Pure, DOM-free helpers for the pipeline board (P3). The board answers ONE
 * question — "which of my deals needs me?" — so this module only shapes the
 * data the card needs to decide, nothing more. Verdict colour comes from the
 * SINGLE core source (`verdictForScore`) so the board, the analyser chip and the
 * extension speak one visual language. Tested in board.test.ts.
 */
import { verdictForScore } from '@gil-bricks/core';
import { PROGRESS_STAGES, DEAD_STAGE, type Stage } from '../../config/pipeline';

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
  updated_at: string;
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

/**
 * The current analysis's verdict snapshot (P2), published by whichever verdict
 * component is mounted so the Save flow can store what the score rested on: the
 * 0-10 Deal Score and the personal criteria (thresholds + assumptions) it was
 * judged against. Mirrors the `keyFigure` pattern. `null` = no verdict yet.
 */
import { signal } from '@preact/signals';

export interface VerdictSnapshot {
  score: number | null;
  criteriaJson: string;
  /** The ONE strategy-appropriate figure the pipeline board card shows (P3):
   * BTL monthly cashflow, BRRRR money left in, Flip profit, HMO ROI — the
   * analyser's own display string, so the card can never contradict the deal. */
  boardFigure: string;
}
export const verdictSnapshot = signal<VerdictSnapshot | null>(null);

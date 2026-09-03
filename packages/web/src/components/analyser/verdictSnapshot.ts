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
}
export const verdictSnapshot = signal<VerdictSnapshot | null>(null);

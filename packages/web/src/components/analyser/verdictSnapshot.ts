/**
 * The current analysis's verdict snapshot (P2), published by whichever verdict
 * component is mounted so the Save flow can store what the score rested on: the
 * 0-10 Deal Score and the personal criteria (thresholds + assumptions) it was
 * judged against. Mirrors the `keyFigure` pattern. `null` = no verdict yet.
 */
import { signal } from '@preact/signals';

export interface VerdictSnapshot {
  score: number | null;
  /** The analyser's own verdict line (DealScore.headline) — the short reason in the
   * user's voice, referencing their own criteria. Shown as the card's verdict. */
  headline: string;
  criteriaJson: string;
  /** The analyser's "one change away" sentence when there is one (N2): a screen
   * reader hears it with the score, because it is the most useful line we make.
   * null when the deal has no single lever. */
  lever: string | null;
  /** The ONE strategy-appropriate figure the pipeline board card shows (P3):
   * BTL monthly cashflow, BRRRR money left in, Flip profit, HMO ROI — the
   * analyser's own display string, so the card can never contradict the deal. */
  boardFigure: string;
}
export const verdictSnapshot = signal<VerdictSnapshot | null>(null);

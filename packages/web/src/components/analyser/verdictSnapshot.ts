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
  /**
   * The sold-price band this score was judged against (P5.1) — the SAME
   * `{estimate, high}` handed to scoreDeal. Stored with the deal so a later
   * re-score uses the evidence the save used, instead of quietly losing a
   * component worth 2.5 of 10. `null` = there was no valuation, and we know it.
   */
  soldEvidence: { estimate: number; high: number } | null;
  /**
   * HMO only: how many rooms failed the statutory minimum, or null when they
   * were not measured. Stored with the deal so a later re-score knows what this
   * score knew — the measurements live in this page, never in the URL (P6).
   */
  roomSizeFailures?: number | null;
}
export const verdictSnapshot = signal<VerdictSnapshot | null>(null);

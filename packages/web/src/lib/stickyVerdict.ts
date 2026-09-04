/**
 * Pure, DOM-free decisions for the sticky verdict bar (N1), tested in
 * stickyVerdict.test.ts. The island (components/analyser/StickyVerdict.tsx)
 * only wires events to these — it decides nothing itself.
 */
import { verdictForScore } from '@gil-bricks/core';
import { STICKY_VERDICT } from '../config/stickyVerdict';

/** Tier class for a score — the SAME classes the Deal Score chip and the board
 * use (ds-good / ds-marginal / ds-walk), from core's ONE verdict source. */
export function tierClass(score: number): 'ds-good' | 'ds-marginal' | 'ds-walk' {
  const v = verdictForScore(score);
  return v === 'good' ? 'ds-good' : v === 'marginal' ? 'ds-marginal' : 'ds-walk';
}

/** The score as the bar prints it — one decimal, matching the chip's "7.9". */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

/** The full spoken verdict for the polite live region: score, tier, the verdict
 * line AND the lever when there is one (N2) — never a bare number. */
export function announcement(score: number, headline: string, lever: string | null = null): string {
  return STICKY_VERDICT.copy.announce(formatScore(score), verdictForScore(score), headline.trim(), (lever ?? '').trim());
}

/** The shape of a focus target the bar cares about (a DOM element, or a test double). */
export interface FocusTarget {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
}
const KEYBOARD_INPUT_TYPES = new Set(['text', 'number', 'search', 'tel', 'email', 'url', 'password', '']);
/**
 * True for a control that summons the on-screen keyboard — a text-ish input,
 * a textarea or contenteditable. Selects, checkboxes, radios and buttons don't
 * (and hiding the bar on those would defeat "change the deposit, watch the score").
 */
export function isTextEntry(el: FocusTarget | null | undefined): boolean {
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return KEYBOARD_INPUT_TYPES.has((el.type ?? '').toLowerCase());
  return el.isContentEditable === true;
}

/** The bar un-sticks when it would eat more than the configured share of the
 * viewport (high zoom / tiny screen). 0-height viewports never un-stick. */
export function shouldUnstick(barHeight: number, viewportHeight: number): boolean {
  if (!(viewportHeight > 0) || !(barHeight > 0)) return false;
  return barHeight / viewportHeight > STICKY_VERDICT.maxViewportShare;
}

/** The on-screen keyboard is up when the visual viewport has shrunk well below
 * the layout viewport. Missing/zero measurements mean "don't know" → not open. */
export function keyboardLikelyOpen(visualHeight: number | undefined, layoutHeight: number): boolean {
  if (!(layoutHeight > 0) || visualHeight === undefined || !(visualHeight > 0)) return false;
  return visualHeight < layoutHeight * STICKY_VERDICT.keyboardViewportRatio;
}

/** Whether the bar is visible right now. It exists only for a finite score;
 * it steps aside while a text field is focused or the keyboard is up. */
export function barVisible(opts: { score: number | null; textFocused: boolean; keyboardOpen: boolean }): boolean {
  if (opts.score === null || !Number.isFinite(opts.score)) return false;
  return !opts.textFocused && !opts.keyboardOpen;
}

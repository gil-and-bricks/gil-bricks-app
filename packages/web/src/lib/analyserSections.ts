/**
 * Pure decisions for the section overview strip (N2). No DOM, no copy — the
 * chips' words live in config/analyserSections.ts and the maths lives nowhere
 * near here. Tested in analyserSections.test.ts.
 */
import { ANALYSER_SECTIONS, SECTION_STRIP, type AnalyserSection } from '../config/analyserSections';
import { STICKY_VERDICT } from '../config/stickyVerdict';
import { shouldUnstick } from './stickyVerdict';

/** The chips to show: config order, filtered to the sections actually present.
 * A chip whose section is not on this strategy's page is never rendered — a
 * dead jump link is worse than a missing one. */
export function visibleSections(presentIds: Iterable<string>): AnalyserSection[] {
  const present = new Set(presentIds);
  return ANALYSER_SECTIONS.filter((s) => present.has(s.id));
}

/**
 * Which chip is "current" as you scroll: the LOWEST section whose top has passed
 * under the pinned stack (so the strip names the section you are reading, not
 * the one arriving), falling back to the topmost section while above them all.
 * Sorted by MEASURED position, never by the order they were handed in — some
 * sections nest inside others (the cost tile lives in the figures grid), so
 * config order is not page order and must never decide this.
 */
export function activeSectionId(
  tops: ReadonlyArray<{ id: string; top: number }>,
  stackHeight: number,
): string | null {
  if (tops.length === 0) return null;
  const byPosition = [...tops].sort((a, b) => a.top - b.top);
  let current = byPosition[0].id;
  for (const s of byPosition) {
    if (s.top - stackHeight <= SECTION_STRIP.spyTolerancePx) current = s.id;
  }
  return current;
}

/** How far to scroll the strip so the active chip is fully in view, without
 * ever moving the page. Returns the container's new scrollLeft. */
export function chipScrollLeft(
  chip: { left: number; width: number },
  strip: { scrollLeft: number; width: number },
  pad = 16,
): number {
  const left = chip.left - pad;
  const right = chip.left + chip.width + pad;
  if (left < 0) return Math.max(0, strip.scrollLeft + left);
  if (right > strip.width) return strip.scrollLeft + (right - strip.width);
  return strip.scrollLeft;
}

/** The pinned stack (bar + strip) may never eat the screen: the same share rule
 * as the sticky bar, applied to the two together (N1 item 8). */
export function stackUnsticks(barHeight: number, stripHeight: number, viewportHeight: number): boolean {
  return shouldUnstick(barHeight + stripHeight, viewportHeight);
}

/** The strip's own share of the rule, exported so the value can never drift. */
export const MAX_STACK_SHARE = STICKY_VERDICT.maxViewportShare;

/** The height of everything pinned at the top right now (the sticky verdict bar
 * plus the section strip). ONE place computes it, so a third pinned thing can
 * never be forgotten by whatever needs to clear it. */
export function pinnedStackPx(): number {
  if (typeof getComputedStyle !== 'function' || typeof document === 'undefined') return 0;
  const cs = getComputedStyle(document.documentElement);
  return [STICKY_VERDICT.heightVar, SECTION_STRIP.heightVar]
    .reduce((total, name) => total + (parseFloat(cs.getPropertyValue(name)) || 0), 0);
}

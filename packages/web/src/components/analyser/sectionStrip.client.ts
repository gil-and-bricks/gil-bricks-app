/**
 * Progressive enhancement for the section overview strip (N2). The strip works
 * without any of this — the chips are anchors and the browser does the jumping.
 * This adds three things and nothing else:
 *   1. reveals only the chips whose section is on THIS page (never a dead jump),
 *   2. marks the section you are reading (aria-current) and keeps that chip in view,
 *   3. publishes the strip's height so scroll-padding-top clears the whole pinned
 *      stack, and un-sticks it when the stack would eat a small screen.
 * All decisions are the pure helpers in lib/analyserSections.ts.
 */
import { ANALYSER_SECTIONS, SECTION_STRIP } from '../../config/analyserSections';
import { STICKY_VERDICT } from '../../config/stickyVerdict';
import { activeSectionId, chipScrollLeft, pinnedStackPx, stackUnsticks } from '../../lib/analyserSections';

const HEIGHT_VAR = SECTION_STRIP.heightVar;
/** Beyond this share of the row the switcher stops pinning: at 200% text it
 * would otherwise cover every chip behind it. */
const SEG_MAX_SHARE = 0.6;

export function startSectionStrip(): void {
  // The pinned ROW is the scroll container (it also holds the strategy
  // switcher, which stays put at its left edge); the strip is the chips in it.
  const rowEl = document.querySelector<HTMLElement>('[data-pinned-row]');
  if (rowEl === null) return;
  // The chips are optional (features.sectionOverview): a row holding only the
  // strategy switcher still has to publish its height and un-stick.
  const strip = rowEl.querySelector<HTMLElement>('[data-section-strip]');
  const row = strip?.querySelector<HTMLElement>('.strip-row') ?? null;
  const chips = new Map<string, HTMLAnchorElement>();
  for (const a of rowEl.querySelectorAll<HTMLAnchorElement>('[data-chip]')) {
    chips.set(a.dataset.chip ?? '', a);
  }
  const root = document.documentElement;
  let live: string[] = [];
  let published = '';
  let lastActive: string | null = null;

  /** The pinned switcher's width: the row's own scroll-padding clears it, and a
   * switcher too wide for the row stops pinning rather than burying the chips. */
  const publishSegment = (): void => {
    const seg = rowEl.querySelector<HTMLElement>('.strategy-seg');
    if (seg === null) return;
    const wide = seg.getBoundingClientRect().width > rowEl.getBoundingClientRect().width * SEG_MAX_SHARE;
    rowEl.classList.toggle('seg-wide', wide);
    rowEl.style.setProperty('--seg-w', wide ? '0px' : `${Math.ceil(seg.getBoundingClientRect().width)}px`);
  };

  /** The desktop rail sits BESIDE the page, so it costs the top nothing. CSS
   * owns the breakpoint and tells us which shape the row is in. */
  const isVertical = (): boolean => getComputedStyle(rowEl).getPropertyValue('--pinned').trim() === 'vertical';

  const publishHeight = (): void => {
    // The bar publishes its own pinned height (0 when it has un-stuck); the two
    // pin together, so the share rule is applied to the pair, not to each.
    const barHeight = parseFloat(getComputedStyle(root).getPropertyValue(STICKY_VERDICT.heightVar)) || 0;
    const height = isVertical() ? 0 : Math.ceil(rowEl.getBoundingClientRect().height);
    const off = height > 0 && stackUnsticks(barHeight, height, window.innerHeight);
    rowEl.classList.toggle('is-unstuck', off);
    const next = off || height === 0 ? '0px' : `${height}px`;
    // only WRITE on a real change — the style attribute is watched below, and a
    // no-op write would wake the observer for ever
    if (next !== published) {
      published = next;
      root.style.setProperty(HEIGHT_VAR, next);
    }
  };

  /** Which sections exist right now? The analyser renders them as you fill it in. */
  const sync = (): void => {
    publishSegment();
    if (strip === null) {
      publishHeight();
      return;
    }
    const present = ANALYSER_SECTIONS.filter((s) => document.getElementById(s.id) !== null).map((s) => s.id);
    if (present.join() !== live.join()) {
      live = present;
      for (const [id, chip] of chips) chip.hidden = !present.includes(id);
      strip.classList.toggle('is-live', present.length > 0);
    }
    publishHeight();
  };

  const spy = (): void => {
    if (strip === null || live.length === 0) return;
    // What the pinned stack actually costs the TOP of the page — 0 for the
    // desktop side rail, which sits beside the page and hides nothing. Reading
    // the row's own box would put the line half a screen down.
    const stack = pinnedStackPx();
    const tops = live
      .map((id) => ({ id, el: document.getElementById(id) }))
      .filter((s): s is { id: string; el: HTMLElement } => s.el !== null)
      .map((s) => ({ id: s.id, top: s.el.getBoundingClientRect().top }));
    const active = activeSectionId(tops, Math.max(stack, 0));
    for (const [id, chip] of chips) {
      if (id === active) chip.setAttribute('aria-current', 'true');
      else chip.removeAttribute('aria-current');
    }
    // Bring the current chip into view ONLY when it actually changed, and never
    // while the strip has focus or the user is scrolling it by hand — snapping a
    // hand-scrolled strip back on every scroll frame would fight them.
    const chip = active === null ? null : chips.get(active);
    const changed = active !== lastActive;
    lastActive = active;
    if (chip && row && changed && !rowEl.contains(document.activeElement)) {
      const c = chip.getBoundingClientRect();
      const s = rowEl.getBoundingClientRect();
      // the switcher is pinned at the left edge of the row: never park a chip under it
      const seg = rowEl.querySelector<HTMLElement>('.strategy-seg');
      const inset = seg === null ? 0 : Math.ceil(seg.getBoundingClientRect().width);
      rowEl.scrollLeft = chipScrollLeft({ left: c.left - s.left - inset, width: c.width }, { scrollLeft: rowEl.scrollLeft, width: s.width - inset });
    }
  };

  let queued = false;
  const schedule = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
      spy();
    });
  };

  sync();
  spy();
  const main = document.querySelector('main');
  if (main !== null) new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
  // The sticky bar mounts LATE (client:idle) and publishes its height as an
  // inline custom property on <html>; without watching for that, the pair's
  // share of a short screen would be judged on a bar height of zero.
  new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['style'] });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(schedule).observe(rowEl);
  document.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
}
